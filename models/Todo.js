const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  text:      { type: String, required: true, trim: true, maxlength: 200 },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const historySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created','completed','reopened','edited','priority_changed',
           'category_changed','due_date_changed','tags_changed','notes_changed',
           'archived','day_rolled','unarchived'],
    required: true,
  },
  description:   { type: String, required: true },
  changedFields: [{ type: String }],
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue:      { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp:     { type: Date, default: Date.now },
}, { _id: true });

const todoSchema = new mongoose.Schema({
  text:      { type: String, required: true, trim: true, maxlength: 500 },
  completed: { type: Boolean, default: false },
  priority:  { type: String, enum: ['low','medium','high'], default: 'medium' },
  category:  { type: String, trim: true, default: 'General' },
  dueDate:   { type: Date, default: null },
  tags:      [{ type: String, trim: true }],
  notes:     { type: String, trim: true, default: '' },
  order:     { type: Number, default: 0 },
  subtasks:  [subtaskSchema],
  archived:  { type: Boolean, default: false },
  archivedAt:{ type: Date, default: null },
  dayTag:    { type: String, default: () => new Date().toISOString().substring(0,10) },
  history:   [historySchema],
}, { timestamps: true });

todoSchema.index({ completed: 1, createdAt: -1 });
todoSchema.index({ priority: 1 });
todoSchema.index({ archived: 1 });
todoSchema.index({ dayTag: 1 });

module.exports = mongoose.model('Todo', todoSchema);