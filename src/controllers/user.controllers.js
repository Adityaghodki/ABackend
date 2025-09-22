import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/User.js";
import { uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
const registerUser = asyncHandler(async(req,res)=>{
   //register user logic
   // get user data from frontend

   const {username,email,password,fullname} = req.body
   console.log("email", email);
   
   // validate [non empty fields etc]

   if(
      [fullname,email,password,username].some((field)=>field?.trim()==="")
   ){
      throw new ApiError("All fields are required",400)
   }
   // check if the user already exists [email,username]
   const existedUser = User.findOne(
      {$or:[{email},{username}]}
   );
   if(existedUser){
      throw new ApiError("User already exists",409)
   }

   // check for avatar and image 

   const avatarLocapath = req.files?.avatar[0]?.path;
   const coverImageLocalpath = req.files?.coverImage[0]?.path;

   if(!avatarLocapath ){
      throw new ApiError("Avatar is required",400)
   }

   // upload avatar to cloudinary

   const avatar= await uploadOnCloudinary(avatarLocapath);
   const coverImage = await uploadOnCloudinary(coverImageLocalpath);

   if(!avatar){
      throw new ApiError("error while uploading avatar",400)
   }

   // create user object and save to db

   const user = await User.create({
      fullName,
      avatar:avatar.url,
      coverImage: coverImage?.url || "",
      email,
      username: username.toLowerCase(),
      password
   })

   // remove password and refreshToken from the response
   const craetedUser = await User.findById(user._id).select(-"password -refreshToken");

   // check for user creation
   if(!craetedUser){
      throw new ApiError("Something went wrong while registering user",500)
   }

   // return res
   return res.status(201).json(
      new ApiResponse(200, craetedUser, "User registered successfully")
   )
   
   
   
})
export {registerUser};