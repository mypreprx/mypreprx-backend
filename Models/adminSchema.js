import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: "admin"
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  sessionToken: {
    type: String,
    default: null
  }
}, { timestamps: true });

const adminModel=mongoose.model("Admin", adminSchema);
export default adminModel;
