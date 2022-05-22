const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
//========================
async function run() {
    try {
        await client.connect();
        console.log("db connected");
        const productCollection = client
            .db("master-precision")
            .collection("products");
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
