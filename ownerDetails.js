const mongoose = require("mongoose");
const ownerDetailsSchema = new mongoose.Schema(
    {
        firstname: String, 
        lastname: String,
         email: { type: String, unique: true },
          password: String},{
        collection: "ownerInfo"
    });
mongoose.model("OwnerInfo", ownerDetailsSchema);
