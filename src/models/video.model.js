import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

export const VIDEO_STATUS = {
  UPLOADING: "uploading",
  PROCESSING: "processing",
  PROCESSED: "processed",
  FAILED: "failed",
};

const videoSchema = new Schema(
  {
    videoFile: {
      type: String, // Cloudinary or Azure Blob URL/key
      default: "",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Day 4 & Day 5 fields
    blobKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(VIDEO_STATUS),
      default: VIDEO_STATUS.UPLOADING,
      index: true,
    },
    hlsKey: {
      type: String,
      default: "",
      trim: true,
    },
    thumbnailKey: {
      type: String,
      default: "",
      trim: true,
    },
    originalFileName: {
      type: String,
      default: "",
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    failureReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

videoSchema.plugin(mongooseAggregatePaginate);
videoSchema.index({ owner: 1, createdAt: -1 });
videoSchema.index({ isPublished: 1, createdAt: -1 });
videoSchema.index({ status: 1, createdAt: -1 });

export const Video = mongoose.model("Video", videoSchema);
