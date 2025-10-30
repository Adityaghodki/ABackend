import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import { uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

// function to generate access and refresh tokens
const generateRefreshAndAccessToken = async(userId)=>{
   try {
      const user = await User.findById(userId);
      const accessToken = user.generateAccessToken();
      const refreshToken = user.generateRefreshToken();

      user.refreshToken = refreshToken;
      await user.save({validateBeforeSave:false});
      return {accessToken,refreshToken};
   } catch (error) {
      throw new ApiError("Error while generating tokens",500);
   }
}

const registerUser = asyncHandler(async(req,res)=>{
   //register user logic
   // get user data from frontend

   const {username,email,password,fullName} = req.body
   console.log("email", email);
   
   // validate [non empty fields etc]

   if(
      [fullName,email,password,username].some((field)=>field?.trim()==="")
   ){
      throw new ApiError("All fields are required",400)
   }
   // check if the user already exists [email,username]
   const existedUser = await User.findOne(
      {$or:[{email},{username}]}
   );
   if(existedUser){
      throw new ApiError("User already exists",409)
   }

   // check for avatar and image 
  
   const avatarLocapath = req.files?.avatar[0]?.path;
   //const coverImageLocalpath = req.files?.coverImage[0]?.path;
   let coverImageLocalpath;
   if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
      coverImageLocalpath = req.files.coverImage[0].path;
      
   }
  
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
const loginUser = asyncHandler(async(req,res)=>{
   //login user logic
   // get data from dom (or frontend)
   //uername or email
   const {email,password,username} = req.body;
   console.log(email);
   if(!username && !email){                                    //if we want to login with either username or email
      throw new ApiError(400,"username or email is required");     //then use if(!(username || email)){throw new ApiError }
   }
   
    // validate data
   const user = await User.findOne({ //here capital User is model i.e of mongoose
      $or:[{email},{username}]//this small user is the on method made by us and here instance of it is taken care by mongoose
   });
   // check if user exists
   if(!user){
      throw new ApiError("user does not exist",404)
   }
    // compare passwords
   const isPasswordValid = await user.isPasswordCorrect(password);
   if(!isPasswordValid){
      throw new ApiError("Invalid credentials",401);
   }
   // generate access and refresh tokens
   const {accessToken,refreshToken} = await generateRefreshAndAccessToken(user._id);
   const loggedInUser = await User.findById(user._id).select(-"password -refreshToken");
   // send cookies and response

   const options = {
      httpOnly:true,
      secure: true
   };
   return res.status(200)
   .cookie("refreshToken",refreshToken,options).cookie("accessToken",accessToken,options)
   .json(
      new ApiResponse(200,
         {
            user:loggedInUser,
            accessToken,refreshToken
         },
         "User logged in successfully"
      )
   )
})

const logoutUser = asyncHandler(async(req,res)=>{
   User.findByIdAndUpdate(
      req.user._id,
      {
         $set: {
            refreshToken: undefined
         }
      },
      {
         new: true,
      }
   )
   const options = {
      httpOnly:true,
      secure: true
   };
   return res.status(200)
   .cookie("accessToken",options)
   .cookie("refreshToken",options)
   .json(
      new ApiResponse(200,{},"User logged out successfully")
   )
});

// code for refresh access token 
const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
      if(!incomingRefreshToken){
      throw new ApiError("unauthorized request",401);
      }
      try {
         const decodedToken =jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
         )
         const user = await User.findById(decodedToken?._id);
         if(!user){
            throw new ApiError("invalid refresh token",401);
         }
         if(user?.refreshToken !== incomingRefreshToken){
          throw new ApiError("Refresh token is expired or used",401);
         }
   
         const options = {
            httpOnly:true,
            secure: true
         };
         const {accessToken,newRefreshToken} =
         await generateRefreshAndAccessToken(user._id);
   
         return res.status(200)
         .cookie("refreshToken", newRefreshToken ,options)
         .cookie("accessToken", accessToken ,options)
         .json(
            new ApiResponse(200,
               {
                  accessToken,
                  refreshToken : newRefreshToken
               },
               "Access token refreshed successfully"
            )
         )
      } catch (error) {
        throw new ApiError(401,error?.message || "invalid refresh token" );
      }
   });

   const changeCurrentPassword = asyncHandler(async(req,res)=>{
      const {oldPassword,newPassword} = req.body;

      const user = await User.findById(req.user?._id)
      const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

      if(!isPasswordCorrect){
         throw new ApiError("Old password is incorrect",400);
      }
      user.password = newPassword;
      await user.save(validateBeforeSave=false);

      return res.status(200).json(
         new ApiResponse(200,{},"Password changed successfully")
      )

   });

   const getcurrentUser = asyncHandler(async(req,res)=>{
      return res.status(200).json(
         new ApiResponse(200,req.user,"Current user fetched successfully")
      )
   });

   const updateAccountDetails = asyncHandler(async(req,res)=>{
      const {fullName,email} = req.body;

      if(!(fullName || !email)){
         throw new ApiError("Atleast one field is required to update",400);
      }

      const user = await  User.findByIdAndUpdate(
         req.user?._id,
         {
            $set:{
               fullName,
               email: email,
            }
         },{
            new:true,
         },
      ).select(-"password" );

      return res.status(200).json(
         new ApiResponse(200,user,"User details updated successfully")
      )

   });

   const updateAvatar = asyncHandler(async(req,res)=>{
      const avatarLocalpath = req.file?.path;

      if(!avatarLocalpath){
         throw new ApiError("Avatar file is required",400);
      }

      const avatar = await uploadOnCloudinary(avatarLocalpath);

      if(!avatar.url){
         throw new ApiError("Error while uploading avatar",500);
      }
      const user = await User.findByIdAndUpdate(
         req.user?._id,
         {
            $set:{
               avatar: avatar.url,
            }
         },{
            new:true,
         }
      ).select(-"password");
      return res.status(200).json(
         new ApiResponse(200,user,"Avatar updated successfully")
      )
   });

   const updateCoverImage = asyncHandler(async(req,res)=>{
      const coverImageLocalpath = req.file?.path;

      if(!coverImageLocalpath){
         throw new ApiError("Cover image file is required",400);
      }
      const coverImage = await uploadOnCloudinary(coverImageLocalpath);

      if(!coverImage.url){
         throw new ApiError("Error while uploading cover image",500);
      }
      const user = await User.findByIdAndUpdate(
         req.user?._id,
         {
            $set:{
               coverImage: coverImage.url,
            }
         },{
            new:true,
         }
      ).select(-"password");
      return res.status(200).json(
         new ApiResponse(200,user,"Cover image updated successfully")
      )
   });

   const getUserChannelProfile = asyncHandler(async(req,res)=>{
   
      const {username} = req.params; // we want user url , thus we user req.params
      if(!username?.trim()){
         throw new ApiError("username is missing",400);
      }
      const channel = await User.aggregate([

         {
            $match: {username: username?.toLowerCase()}
         },
         {
            $lookup: {
               from: "subscriptions", // collection name in db
               localField : "_id",
               foreignField: "channel",
               as: "subscribers"
            }
         },
         {
            $lookup: { 
               form: "subscriptions",
               localField: "_id",
               foreignField: "subscriber",
               as: "subscribedTo"
             }
         },{
            $addFields: {
               subscribersCount:{
                  $size : "$subscribers"
               },
               channelsSubscribedToCount: {
                  $size : "$subscribedTo"
               },
               isSubscribed: {
                  $cond: {
                     if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                     then: true,
                     else: false
                  }
               }
            }
         },
         {
            $project: {
               fullName: 1,
               username: 1,
               subscribersCount: 1,
               channelsSubscribedToCount: 1,
               isSubscribed: 1,
               avatar: 1,
               coverImage: 1,
               email: 1 
            }
         }

      ]);

      if(!channel?.length){
         throw new ApiError("Channel does not existed",404);
      }

      return res.status(200).json(
         new ApiResponse(200,channel[0],"User channel profile fetched successfully")
      )
   
   });

   const getWatchHistory = asyncHandler(async(req,res)=>{
      const user = await User.aggregate([
         {
            $match: 
            {_id: new mongoose.Types.ObjectId(req.user._id)
            } 
         },
         {
            $lookup: {
               from: "videos",
               localField: "watchHistory",
               foreignField: "_id",
               as: "watchHistory",
               pipeline: [
                  {
                     $lookup: {
                        from: "users",
                        localField: "owner",
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                           {
                              $project: {
                                 fullName: 1,
                                 username: 1,
                                 avatar: 1
                              }
                           }
                        ]
                     }
                  },
                  {
                     $addFields: {
                        $first: "$owner"
                     }
                  }
               ]
            }
         }
      ]);
      return res.status(200).json(
         new ApiResponse(200,user[0]?.watchHistory || [],"Watch history fetched successfully")
      )
   });

export {registerUser
   ,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword
   ,getcurrentUser,updateAccountDetails,updateAvatar,updateCoverImage,getUserChannelProfile
   ,getWatchHistory
};