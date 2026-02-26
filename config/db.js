import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true,
    });

    console.log(`🗄️ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};


//MONGO_URI=mongodb+srv://Kiosk:kiosk@cluster0.kacqumb.mongodb.net/Outfit?retryWrites=true&w=majority&appName=Cluster0/yhiw

export default connectDB;
