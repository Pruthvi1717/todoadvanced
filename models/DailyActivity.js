const mongoose = require('mongoose');

// One document per calendar day (YYYY-MM-DD).
// count = number of tasks completed that day.
const dailyActivitySchema = new mongoose.Schema({
  date:  { type: String, required: true, unique: true }, // 'YYYY-MM-DD'
  count: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

dailyActivitySchema.index({ date: 1 });

module.exports = mongoose.model('DailyActivity', dailyActivitySchema);