const mongoose = require('mongoose');

// One document per calendar day (YYYY-MM-DD).
// count         = tasks completed that day (positive heatmap)
// negativeCount = tasks reopened/uncompleted that day (negative heatmap)
const dailyActivitySchema = new mongoose.Schema({
  date:          { type: String, required: true, unique: true }, // 'YYYY-MM-DD'
  count:         { type: Number, default: 0, min: 0 },
  negativeCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

dailyActivitySchema.index({ date: 1 });

module.exports = mongoose.model('DailyActivity', dailyActivitySchema);