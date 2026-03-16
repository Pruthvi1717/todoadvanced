const mongoose = require('mongoose');

const coinLedgerSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'task_complete_low',    // +5
      'task_complete_medium', // +10
      'task_complete_high',   // +20
      'subtasks_bonus',       // +5  (all subtasks done)
      'streak_bonus',         // +streak×2
      'first_task_day',       // +15 (first completion of the day)
      'daily_login',          // +3  (once per day)
      'task_uncomplete',      // negative — task reopened (2× penalty)
      'task_fail',            // negative — task explicitly marked as not completed (2× penalty)
    ],
    required: true,
  },
  delta:     { type: Number, required: true },
  balance:   { type: Number, required: true },
  todoId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Todo', default: null },
  todoText:  { type: String, default: '' },
  note:      { type: String, default: '' },
  date:      { type: String, default: () => new Date().toISOString().substring(0,10) },
}, { timestamps: true });

coinLedgerSchema.index({ createdAt: -1 });
coinLedgerSchema.index({ date: 1 });

module.exports = mongoose.model('CoinLedger', coinLedgerSchema);