import User from '../models/userModel.js';







export const savePushToken = async (req, res) => {
  try {
    const { pushToken, userId } = req.body;

    if (!pushToken || !userId) {
      return res.status(400).json({
        success: false,
        message: 'pushToken and userId are required',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { pushToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Push token saved successfully',
    });

  } catch (error) {
    console.error('Error saving push token:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};