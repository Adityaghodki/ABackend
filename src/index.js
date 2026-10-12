import { config } from "./config/env.js";
import connectDB from "./db/index.js";
import { app } from "./app.js";

connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`⚙️ Server is running at port : ${config.port}`);
  });
});
