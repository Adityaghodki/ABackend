import mongoose ,{Schema} from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
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
    this.password = bcrypt.hash(this.password,10)
    next()
})

userSchema.methods.isPasswordCorrect = async function(password) {
    return await bcrypt.compare(password,this.password)
}
userSchema.methods.generateAccessToken = function(){
    jwt.sign({
        _id:this._id,
        username: this.username,
        email: this.email
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiration: process.env.ACCESS_TOKEN_EXPIRY
    }
)
}
userSchema.methods.generateRefreshToken = function(){
    jwt.sign({
        _id:this._id,
        username: this.username,
        email: this.email
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
        expiration: process.env.REFRESH_TOKEN_EXPIRY
    }
)
}

export const User = mongoose.model("User",userSchema)