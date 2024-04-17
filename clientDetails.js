const mongoose = require("mongoose");
const clientDetailsSchema = new mongoose.Schema(
    {
        firstname: String, 
        lastname: String,
         email: { type: String, unique: true },
          password: String},{
        collection: "clientInfo"
    });
mongoose.model("ClientInfo", clientDetailsSchema);
