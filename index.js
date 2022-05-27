const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// const corsConfig = {
//     origin: true,
//     credentials: true,
// }
// app.use(cors(corsConfig));
// app.options('*', cors(corsConfig));

// app.use(cors());
app.use(
    cors({
        origin: true,
        optionsSuccessStatus: 200,
        credentials: true,
    })
);


app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qt3lu.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        console.log('db connected');
        const productCollection = client.db('nifty_knife').collection('products');
        const usersCollection = client.db('nifty_knife').collection('users');
        const ordersCollection = client.db('nifty_knife').collection('orders');
        const paymentsCollection = client.db('nifty_knife').collection('payments');
        const reviewsCollection = client.db('nifty_knife').collection('reviews');


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // app.get('/product', async (req, res) => {
        //     const query = {};
        //     const cursor = productCollection.find(query);
        //     const products = await cursor.toArray();
        //     res.send(products);
        // });


        // app.put("/user/:email", async (req, res) => {
        //     const email = req.params.email;
        //     const user = req.body;
        //     const filter = { email: email };
        //     const options = { upsert: true };
        //     const updateDoc = {
        //         $set: user,
        //     };
        //     const result = await usersCollection.updateOne(filter, updateDoc, options);
        //     const token = jwt.sign(
        //         { email: email },
        //         process.env.ACCESS_TOKEN_SECRET,
        //         { expiresIn: "24h" }
        //     );
        //     res.send({ result, token });
        // });
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const orders = req.body;
            const price = orders.totalPrice;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.patch('/orders/:id', async (req, res) => {
            const _id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(_id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentsCollection.insertOne(payment);
            const updatedBooking = await ordersCollection.updateOne(filter, updatedDoc);

            res.send(updatedDoc);


        })

        app.get('/users', async (req, res) => {
            const email = req.query.email;
            console.log(email);
            if (email === undefined || email === '') {
                const query = {};
                const cursor = usersCollection.find(query);
                const user = await cursor.toArray();
                res.send(user);
            }
            else {
                const query = { email: email };
                const cursor = usersCollection.find(query);
                const user = await cursor.toArray();
                res.send(user);
            }

        })


        app.get('/reviews', async (req, res) => {
            const query = {};
            const cursor = reviewsCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews)

        })

        app.post('/reviews', async (req, res) => {
            const newReview = req.body;
            const result = await reviewsCollection.insertOne(newReview);
            res.send(result);
        })


        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);

        });

        app.get('/products', async (req, res) => {
            const id = req.query.id;

            if (id !== undefined) {
                const _id = req.query.id;
                const cursor = productCollection.find({ "_id": ObjectId(_id) });
                const products = await cursor.toArray();
                res.send(products);
            }
            else {
                const query = {};
                const cursor = productCollection.find(query);
                const products = await cursor.toArray();
                res.send(products);
            }
        })

        app.get('/orders', async (req, res) => {
            const email = req.query.email;
            if (email !== undefined) {
                const query = { email: email };
                const cursor = ordersCollection.find(query);
                const products = await cursor.toArray();
                res.send(products);
            }
            else {
                const query = {};
                const cursor = ordersCollection.find(query);
                const products = await cursor.toArray();
                res.send(products);
            }
        })

        app.put('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.put('/user/removeAdmin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: '' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        app.put('/users/:email', async (req, res) => {
            const _id = req.query.id;
            const email = req.params.email;
            console.log(_id, email);
            if (_id !== undefined && email === undefined) {
                const updatedUser = req.body;
                console.log(_id, updatedUser);
                const filter = { "_id": ObjectId(_id) };
                const options = { upsert: true };
                const updateDoc = {
                    $set: {
                        name: updatedUser.name,
                        phone: updatedUser.phone,
                        address: updatedUser.address,
                        email: updatedUser.email,
                        img: updatedUser.img,
                        role: updatedUser.role
                    }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            }
            else {
                const filter = { email: email };
                console.log(email);
                const user = req.body;
                const options = { upsert: true };
                const updateDoc = { $set: user };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                const token = jwt.sign(
                    { email: email },
                    process.env.SECRET_ACCESS_TOKEN,
                    { expiresIn: "24h" }
                );
                res.send({ result, token });
            }
        })

        app.put('/products/:id', async (req, res) => {
            const _id = req.params.id;
            const updatedProduct = req.body;
            console.log(updatedProduct, _id);
            const filter = { "_id": ObjectId(_id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: updatedProduct.name,
                    description: updatedProduct.description,
                    price: updatedProduct.price,
                    quantity: updatedProduct.quantity,
                    minimumQuantity: updatedProduct.minimumQuantity,
                    img: updatedProduct.img,
                }
            };
            const result = await productCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.put('/orders', async (req, res) => {
            const _id = req.query.id;
            const updatedProduct = req.body;
            const filter = { "_id": ObjectId(_id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    userName: updatedProduct.userName,
                    phone: updatedProduct.phone,
                    address: updatedProduct.address,
                    name: updatedProduct.name,
                    email: updatedProduct.email,
                    description: updatedProduct.description,
                    minimumQuantity: updatedProduct.minimumQuantity,
                    price: updatedProduct.price,
                    totalPrice: updatedProduct.totalPrice,
                    quantity: updatedProduct.quantity,
                    img: updatedProduct.img,
                    status: updatedProduct.status
                }
            };
            const result = await ordersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.get('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await ordersCollection.findOne(query);
            res.send(booking);
        })

        app.put('/users', async (req, res) => {
            const _id = req.query.id;
            const updatedUser = req.body;
            console.log(_id, updatedUser);
            const filter = { "_id": ObjectId(_id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: updatedUser.name,
                    phone: updatedUser.phone,
                    address: updatedUser.address,
                    email: updatedUser.email,
                    img: updatedUser.img

                }
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { name: user.name, email: user.email, address: user.address, phone: user.phone, password: user.password };
            const exists = await usersCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, user: exists })
            }
            const result = await usersCollection.insertOne(user);
            res.send({ success: true, result });
        })

        app.post('/products', async (req, res) => {
            const products = req.body;
            const result = await productCollection.insertOne(products);
            res.send({ success: true, result });
        })
        app.post('/orders', async (req, res) => {
            const product = req.body;
            const result = await ordersCollection.insertOne(product);
            res.send(result);
        })

        // app.put("/user/:email", async (req, res) => {
        //     const email = req.params.email;
        //     const filter = { email: email };
        //     const user = req.body;
        //     const options = { upsert: true };
        //     const updateDoc = { $set: user };
        //     const result = await userCollection.updateOne(filter, updateDoc, options);
        //     const token = jwt.sign(
        //         { email: email },
        //         process.env.ACCESS_TOKEN_SECRET,
        //         { expiresIn: "24h" }
        //     );
        //     res.send({ result, token });
        // });

        app.post('/login', async (req, res) => {
            const user = req.body;
            const accessToken = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, {
                expiresIn: '1d'
            });
            res.send({ accessToken });
        })

        app.delete('/products', async (req, res) => {
            const _id = req.query.id;

            // const query = {};
            const result = await productCollection.deleteOne({ "_id": ObjectId(_id) });
            res.send(result);
        })

        app.delete('/orders', async (req, res) => {
            const _id = req.query.id;
            const result = await ordersCollection.deleteOne({ "_id": ObjectId(_id) });
            res.send(result);
        })
    }
    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From Nifty knife server')
})

app.listen(port, () => {
    console.log(`Nifty knife listening on port ${port}`)
})






// ----------------------------------------------------

// const express = require('express')
// const cors = require('cors');
// const jwt = require('jsonwebtoken');

// require('dotenv').config();
// const { MongoClient, ServerApiVersion, MongoRuntimeError, ObjectId } = require('mongodb');
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors());
// app.use(express.json());


// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mg8jq.mongodb.net/?retryWrites=true&w=majority`;

// const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// function verifyJWT(req, res, next) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) {
//         return res.status(401).send({ message: 'UnAuthorized access' });
//     }
//     const token = authHeader.split(' ')[1];
//     jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, function (err, decoded) {
//         if (err) {
//             return res.status(403).send({ message: 'Forbidden access' })
//         }
//         req.decoded = decoded;
//         next();
//     });
// }


// async function run() {
//     try {
//         await client.connect();
        // const productCollection = client.db('assignment-12').collection('products');
        // const ordersCollection = client.db('assignment-12').collection('orders');
        // const usersCollection = client.db('assignment-12').collection('users');
        // const paymentsCollection = client.db('assignment-12').collection('payments');
        // const reviewsCollection = client.db('assignment-12').collection('reviews');

//         const verifyAdmin = async (req, res, next) => {
//             const requester = req.decoded.email;
//             const requesterAccount = await usersCollection.findOne({ email: requester });
//             if (requesterAccount.role === 'admin') {
//                 next();
//             }
//             else {
//                 res.status(403).send({ message: 'forbidden' });
//             }
//         }


        // app.post('/create-payment-intent', verifyJWT, async (req, res) => {
        //     const orders = req.body;
        //     const price = orders.totalPrice;
        //     const amount = price * 100;
        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: "usd",
        //         payment_method_types: ['card']
        //     });
        //     res.send({
        //         clientSecret: paymentIntent.client_secret
        //     })
        // })

        // app.patch('/orders/:id', async (req, res) => {
        //     const _id = req.params.id;
        //     const payment = req.body;
        //     const filter = { _id: ObjectId(_id) };
        //     const updatedDoc = {
        //         $set: {
        //             paid: true,
        //             transactionId: payment.transactionId
        //         }
        //     }
        //     const result = await paymentsCollection.insertOne(payment);
        //     const updatedBooking = await ordersCollection.updateOne(filter, updatedDoc);

        //     res.send(updatedDoc);


        // })
