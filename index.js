const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//use middleware==========
app.use(cors());
app.use(express.json());
//========================

//========================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8jxyt.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized! Access Denied" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        }
        req.decoded = decoded;
        next();
    });
}
//========================
async function run() {
    try {
        await client.connect();
        const productsCollection = client
            .db("master-precision")
            .collection("products");
        const usersCollection = client
            .db("master-precision")
            .collection("users");
        const ordersCollection = client
            .db("master-precision")
            .collection("orders");
        const reviewsCollection = client
            .db("master-precision")
            .collection("reviews");
        const qnaCollection = client.db("master-precision").collection("qna");

        app.get("/qna", async (req, res) => {
            const result = await qnaCollection.find({}).toArray();
            res.send(result);
        });

        app.get("/products", async (req, res) => {
            const limit = parseInt(req.query.limit);
            if (limit) {
                const option = { sort: { _id: -1 } };
                const cursor = productsCollection.find({}, option).limit(limit);
                const products = await cursor.toArray();
                return res.status(200).send(products);
            }
            const products = await productsCollection
                .find({})
                .sort({ _id: -1 })
                .toArray();
            res.status(200).send(products);
        });

        app.put("/products/:id", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const requester = await usersCollection.findOne({
                email: req.decoded.email,
            });
            try {
                if (
                    req.decoded.email === email &&
                    requester?.role === "admin"
                ) {
                    const id = req.params.id;
                    const product = await productsCollection.findOne({
                        _id: ObjectId(id),
                    });
                    const productStock = parseInt(product.stock);
                    const deliveryQuantity = parseInt(req.query.quantity);
                    if (productStock < deliveryQuantity) {
                        return res
                            .status(406)
                            .send({ message: "Insufficient Stock" });
                    }
                    const newStock = productStock - deliveryQuantity;
                    const filter = { _id: ObjectId(id) };
                    const updateDoc = {
                        $set: { stock: newStock },
                    };
                    const options = { upsert: true };
                    const result = await productsCollection.updateOne(
                        filter,
                        updateDoc,
                        options
                    );
                    return res.status(200).send(result);
                }
                return res
                    .status(403)
                    .send({ message: "Forbidden! Access Denied" });
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        app.delete("/products/delete/:id", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const requester = await usersCollection.findOne({
                email: req.decoded.email,
            });
            try {
                if (
                    req.decoded.email === email &&
                    requester?.role === "admin"
                ) {
                    const id = req.params.id;
                    const result = await productsCollection.deleteOne({
                        _id: ObjectId(id),
                    });
                    return res.status(200).send(result);
                }
                return res
                    .status(403)
                    .send({ message: "Forbidden! Access Denied" });
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        app.get("/products/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: ObjectId(id) };
                const product = await productsCollection.findOne(query);
                res.status(200).send(product);
            } catch (error) {
                res.status(400).send({ message: "Bad request" });
            }
        });

        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);
            res.status(200).send(result);
        });

        //Payment
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const price = req.body.price;
            const amount = parseInt(price) * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post("/addProduct", verifyJWT, async (req, res) => {
            try {
                const email = req.query.email;
                const requester = await usersCollection.findOne({
                    email: req.decoded.email,
                });

                if (
                    req.decoded.email === email &&
                    requester?.role === "admin"
                ) {
                    const doc = req.body;
                    const result = await productsCollection.insertOne(doc);
                    return res.status(200).send(result);
                }
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        app.put("/review", verifyJWT, async (req, res) => {
            try {
                const email = req.query.email;
                if (req.decoded.email === email) {
                    const filter = { email: email };
                    const options = { upsert: true };
                    const updateDoc = {
                        $set: req.body,
                    };
                    const result = await reviewsCollection.updateOne(
                        filter,
                        updateDoc,
                        options
                    );
                    return res.status(200).send(result);
                }
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        app.get("/myReview", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email === email) {
                const query = { email: email };
                const review = await reviewsCollection.findOne(query);
                return res.send(review);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        app.get("/reviews", async (req, res) => {
            const limit = parseInt(req.query.limit);
            if (limit) {
                const option = { sort: { _id: -1 } };
                const cursor = reviewsCollection.find({}, option).limit(limit);
                const reviews = await cursor.toArray();
                return res.status(200).send(reviews);
            }
            const reviews = await reviewsCollection
                .find({})
                .sort({ _id: -1 })
                .toArray();
            res.status(200).send(reviews);
        });

        app.delete("/orders/:id", verifyJWT, async (req, res) => {
            try {
                const email = req.query.email;
                if (req.decoded.email === email) {
                    const id = req.params.id;
                    const result = await ordersCollection.deleteOne({
                        _id: ObjectId(id),
                    });
                    return res.status(200).send(result);
                }
                return res.status(400).send({ message: "bad request" });
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        app.put("/orders/:id", verifyJWT, async (req, res) => {
            try {
                const id = req.params.id;
                const updateDoc = {
                    $set: req.body,
                };
                const filter = { _id: ObjectId(id) };
                const options = { upsert: true };
                const result = await ordersCollection.updateOne(
                    filter,
                    updateDoc,
                    options
                );
                return res.status(200).send(result);
            } catch (error) {
                res.status(400).send({ message: "bad request" });
            }
        });

        //Get My Orders
        app.get("/myOrders", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email === email) {
                const query = { email: email };
                const option = { sort: { _id: -1 } };
                const cursor = ordersCollection.find(query, option);
                const orders = await cursor.toArray();
                return res.send(orders);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        app.get("/order/:id", verifyJWT, async (req, res) => {
            const email = req.query.email;
            try {
                const id = req.params.id;
                if (req.decoded.email === email) {
                    const query = { _id: ObjectId(id) };
                    const order = await ordersCollection.findOne(query);
                    return res.send(order);
                }
                return res
                    .status(403)
                    .send({ message: "Forbidden! Access Denied" });
            } catch (error) {}
            return res.status(400).send({ message: "Bad Request" });
        });

        // Get All Order
        app.get("/dashboard/allOrders", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const requester = await usersCollection.findOne({
                email: req.decoded.email,
            });
            if (req.decoded.email === email && requester?.role === "admin") {
                const query = {};
                const option = { sort: { _id: -1 } };
                const cursor = ordersCollection.find(query, option);
                const result = await cursor.toArray();
                return res.status(200).send(result);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        //Check Admin
        app.get("/checkAdmin", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (req?.decoded?.email === email) {
                const user = await usersCollection.findOne({ email: email });
                return res
                    .status(200)
                    .send({ isAdmin: user?.role === "admin" });
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        // Make Admin
        app.put("/users/admin", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const requester = await usersCollection.findOne({
                email: req.decoded.email,
            });
            if (req.decoded.email === email && requester?.role === "admin") {
                const userEmail = req.body.email;

                const filter = { email: userEmail };
                const option = { upsert: true };
                const updateDoc = {
                    $set: { role: "admin" },
                };
                const result = await usersCollection.updateOne(
                    filter,
                    updateDoc,
                    option
                );
                return res.status(200).send(result);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        //Get single user
        app.get("/user", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email === email) {
                const query = { email: email };
                const user = await usersCollection.findOne(query);
                return res.send(user);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        //Get users
        app.get("/users", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email === email) {
                const query = {};
                const users = await usersCollection.find(query).toArray();
                return res.send(users);
            }
            return res
                .status(403)
                .send({ message: "Forbidden! Access Denied" });
        });

        //Update  user data
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const option = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(
                filter,
                updateDoc,
                option
            );
            const token = jwt.sign(
                { email: email },
                process.env.JWT_TOKEN_SECRET,
                { expiresIn: "7d" }
            );
            res.send({ result, token });
        });
    } finally {
    }
}

//========================
app.get("/", (req, res) => {
    res.send("server is running");
});
//========================

//========================
app.listen(port, () => {
    console.log("server is running at port: ", port);
});
//========================
run().catch(console.dir);
