import mongoose ,{Schema} from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
import { config } from "../config/env.js";
const userSchema = new Schema({
    username :{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    email :{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    fullName :{
        type: String,
        required: true,
        index: true,
        trim: true
    },
    avatar :{
        type: String, //cloudinary url to be used
        required: true,
    },
    coverImage :{
        type: String
    },
    watchHistory:[{
        type: Schema.Types.ObjectId,
        ref:"Video"
    }],
    password: {
        type: String,
        required: [true,'Password is required']
    }

},{timestamps: true}
)

userSchema.pre("save", async function(next) {
    if(!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password,10)
    next()
})

userSchema.methods.isPasswordCorrect = async function(password) {
    return await bcrypt.compare(password,this.password)
}
userSchema.methods.generateAccessToken = function(){
    return jwt.sign({
        _id:this._id,
        username: this.username,
        email: this.email
    },
    config.accessTokenSecret,
    {
        expiresIn: config.accessTokenExpiry
    }
)
}
userSchema.methods.generateRefreshToken = function(){
    return jwt.sign({
        _id:this._id,
        username: this.username,
        email: this.email
    },
    config.refreshTokenSecret,
    {
        expiresIn: config.refreshTokenExpiry
    }
)
}

export const User = mongoose.model("User",userSchema)