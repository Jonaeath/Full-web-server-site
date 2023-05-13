const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pg0dj0q.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

function verifyJwt (req, res, next){
    console.log('verify inside token JWT',req.headers.authorization)
    const authHeader = req.headers.authorization;
    if(!authHeader){
      return res.status(401).send('unauthorize access')
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
      if(err){
        return res.status(403).send({message:'forbidden access'})
      }
      req.decoded = decoded;
      next();
    })
}

async function run(){
    try{
        const appointmentOptionCollection = client.db('doctorPortal').collection('appointmentOption');
        const bookingsCollection = client.db('doctorPortal').collection('bookings');
        const usersCollection = client.db('doctorPortal').collection('users');

        // NOTE: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

       
        //USe aggregate to query multiple collection and then merge data
        app.get('/appointmentOption', async(req, res) =>{
          const date =  req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            // get the bookings of the provided date
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            // code carefully :D
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
            })
            res.send(options);
        });

        /*
        *API Naming Convention
        * app.get("/bookings")
        * app.get("/bookings/:id")
        * app.post("/bookings")
        * app.patch("/bookings/:id")
        * app.delete("/bookings/:id")
        */

       app.get('/bookings',verifyJwt, async(req,res)=>{
            const email = req.query.email;
            // console.log('token',req.headers.authorization)
            const decodedEmail = req.decoded.email;
            if(decodedEmail !== email){
              return res.status(403).send({message:'forbidden access'})
            }
            const query = {email:email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);


       })

        app.post('/bookings', async(req, res)=>{
          const booking = req.body;
          const query = {
            appointmentDate: booking.appointmentDate,
            email: booking.email,
            treatment: booking.treatment
        }

        const alreadyBooked = await bookingsCollection.find(query).toArray();

        if (alreadyBooked.length) {
            const message = `You already have a booking on ${booking.appointmentDate}`
            return res.send({ acknowledged: false, message })
        }
          const result = await bookingsCollection.insertOne(booking);
          // send email about appointment confirmation 
          res.send(result);
        });

        app.get('/jwt', async(req, res)=>{
          const email = req.query.email;
          const query = {email: email};
          const user = await usersCollection.findOne(query);
          if(user){
            const token = jwt.sign({email},process.env.ACCESS_TOKEN, {expiresIn:'1h'});
            return res.send({AccessToken: token});
          }
          res.status(403).send({AccessToken: ''})
        })

        app.get('/users', async (req, res) => {
          const query = {};
          const users = await usersCollection.find(query).toArray();
          res.send(users);
      });


      app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.put('/users/admin/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });
 
        app.post('/users', async (req, res) => {
          const user = req.body;
          // TODO: make sure you do not enter duplicate user email
          // only insert users if the user doesn't exist in the database
          const result = await usersCollection.insertOne(user);
          res.send(result);
      });
    }
    finally{

    }

}
run().catch(console.log)

app.get('/',async(req,res) =>{
    res.send('doctors portal server is running')
})

app.listen(port, () => console.log(`doctors portal running on ${port}`))
