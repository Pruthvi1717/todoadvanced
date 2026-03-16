const express       = require('express');
const router        = express.Router();
const crypto        = require('crypto');
const Todo          = require('../models/Todo');
const Settings      = require('../models/Settings');
const DailyActivity = require('../models/DailyActivity');
const CoinLedger    = require('../models/CoinLedger');

const hash    = p  => crypto.createHash('sha256').update(String(p).trim()).digest('hex');
const today   = () => new Date().toISOString().substring(0, 10);
const entry   = (action, desc, fields=[], prev=null, next=null) =>
  ({ action, description:desc, changedFields:fields, previousValue:prev, newValue:next, timestamp:new Date() });

async function getSetting(key)        { const s = await Settings.findOne({ key }); return s ? s.value : null; }
async function setSetting(key, value) { await Settings.findOneAndUpdate({ key }, { value }, { upsert:true }); }

async function bumpActivity(date, delta) {
  const doc = await DailyActivity.findOneAndUpdate({ date }, { $inc: { count: delta } }, { upsert: true, new: true });
  if (doc.count < 0) await DailyActivity.updateOne({ date }, { $set: { count: 0 } });
}

async function bumpNegativeActivity(date, delta) {
  const doc = await DailyActivity.findOneAndUpdate({ date }, { $inc: { negativeCount: delta } }, { upsert: true, new: true });
  if (doc.negativeCount < 0) await DailyActivity.updateOne({ date }, { $set: { negativeCount: 0 } });
}

const COIN_VALUES = {
  task_complete_low: 5, task_complete_medium: 10, task_complete_high: 20,
  subtasks_bonus: 5, first_task_day: 15, daily_login: 3,
};
const PENALTY_MULTIPLIER = 2;

async function getBalance() { const b = await getSetting('coinBalance'); return b !== null ? Number(b) : 0; }

async function getStreak() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yStr = yesterday.toISOString().substring(0,10);
  const days = await DailyActivity.find({}).sort({ date: -1 }).lean();
  let streak = 0, checkDate = today();
  for (const d of days) {
    if (d.date === checkDate && d.count > 0) { streak++; const p = new Date(checkDate); p.setDate(p.getDate()-1); checkDate = p.toISOString().substring(0,10); }
    else if (d.date === checkDate && d.count === 0 && checkDate === today()) { checkDate = yStr; }
    else if (d.date < checkDate) break;
  }
  return streak;
}

async function awardCoins(type, todoId='', todoText='', note='') {
  const base = COIN_VALUES[type] || 0, balance = await getBalance(), newBal = balance + base;
  await setSetting('coinBalance', newBal);
  await CoinLedger.create({ type, delta: base, balance: newBal, todoId: todoId||null, todoText, note });
  return { delta: base, balance: newBal };
}

async function deductCoins(type, delta, todoId='', todoText='', note='') {
  const balance = await getBalance(), newBal = Math.max(0, balance + delta);
  await setSetting('coinBalance', newBal);
  await CoinLedger.create({ type, delta, balance: newBal, todoId: todoId||null, todoText, note });
  return { delta, balance: newBal };
}

async function maybeAwardStreakBonus(streak) {
  if (streak < 2) return null;
  const d = streak * 2, balance = await getBalance(), newBal = balance + d;
  await setSetting('coinBalance', newBal);
  await CoinLedger.create({ type: 'streak_bonus', delta: d, balance: newBal, note: `${streak}-day streak!` });
  return { delta: d, balance: newBal, streak };
}

async function maybeDailyLogin() {
  const last = await getSetting('lastLoginDate'), t = today();
  if (last === t) return null;
  await setSetting('lastLoginDate', t);
  return awardCoins('daily_login', '', '', 'Daily login bonus');
}

// ── PASSCODE ─────────────────────────────────────────────────────────────────
router.get('/passcode/status', async (_req, res) => {
  try { const h = await getSetting('historyPasscode'); res.json({ success: true, isSet: h !== null }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.post('/passcode/set', async (req, res) => {
  try {
    const { passcode } = req.body;
    if (!passcode || passcode.trim().length < 4) return res.status(400).json({ success: false, error: 'Min 4 characters' });
    const existing = await getSetting('historyPasscode');
    if (existing !== null) return res.status(403).json({ success: false, error: 'Already set — use /passcode/change' });
    await setSetting('historyPasscode', hash(passcode)); res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.post('/passcode/change', async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body;
    const existing = await getSetting('historyPasscode');
    if (!existing) return res.status(400).json({ success: false, error: 'No passcode set' });
    if (!currentPasscode || hash(currentPasscode) !== existing) return res.status(401).json({ success: false, error: 'Current passcode incorrect' });
    if (!newPasscode || newPasscode.trim().length < 4) return res.status(400).json({ success: false, error: 'Min 4 characters' });
    await setSetting('historyPasscode', hash(newPasscode)); res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.post('/passcode/verify', async (req, res) => {
  try {
    const existing = await getSetting('historyPasscode');
    if (existing === null) return res.json({ success: true });
    const { passcode } = req.body;
    if (!passcode || hash(passcode) !== existing) return res.status(401).json({ success: false, error: 'Incorrect password' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── HEATMAP ───────────────────────────────────────────────────────────────────
router.get('/stats/heatmap', async (_req, res) => {
  try {
    const since = new Date(); since.setFullYear(since.getFullYear() - 1);
    const sinceStr = since.toISOString().substring(0, 10);
    const rows = await DailyActivity.find({ date: { $gte: sinceStr } }).sort({ date: 1 }).lean();
    const posMap = {}, negMap = {};
    rows.forEach(r => { posMap[r.date] = r.count || 0; negMap[r.date] = r.negativeCount || 0; });
    const days = [], negDays = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().substring(0, 10);
      days.push({ date: key, count: posMap[key] || 0 });
      negDays.push({ date: key, count: negMap[key] || 0 });
    }
    const totalCompletions = days.reduce((s,d)=>s+d.count,0), activeDays = days.filter(d=>d.count>0).length, maxCount = Math.max(...days.map(d=>d.count),1);
    const totalNonCompletions = negDays.reduce((s,d)=>s+d.count,0), negActiveDays = negDays.filter(d=>d.count>0).length, negMaxCount = Math.max(...negDays.map(d=>d.count),1);
    let maxStreak=0,cur=0; days.forEach(d=>{if(d.count>0){cur++;if(cur>maxStreak)maxStreak=cur;}else cur=0;});
    let streak=0; for(let i=days.length-1;i>=0;i--){if(days[i].count>0)streak++;else if(i===days.length-1)continue;else break;}
    res.json({ success:true, days, totalCompletions, activeDays, maxCount, streak, maxStreak, negDays, totalNonCompletions, negActiveDays, negMaxCount });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── COINS ─────────────────────────────────────────────────────────────────────
router.get('/coins', async (_req, res) => {
  try {
    const loginResult = await maybeDailyLogin(), balance = await getBalance(), streak = await getStreak();
    const recent = await CoinLedger.find({}).sort({ createdAt: -1 }).limit(20).lean();
    const todayEarned = await CoinLedger.aggregate([{ $match:{ date:today(), delta:{ $gt:0 } } },{ $group:{ _id:null, total:{ $sum:'$delta' } } }]);
    res.json({ success:true, balance, streak, todayEarned: todayEarned[0]?.total||0, recent, loginBonus: loginResult });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DAY ROLLOVER ──────────────────────────────────────────────────────────────
router.post('/day/rollover', async (req, res) => {
  try {
    const t = today();
    const stale = await Todo.find({ archived: false, completed: false, dayTag: { $ne: t } });
    for (const todo of stale) { todo.history.push(entry('day_rolled',`Carried over from ${todo.dayTag} to ${t}`,['dayTag'],todo.dayTag,t)); todo.dayTag = t; }
    await Promise.all(stale.map(t => t.save()));
    res.json({ success: true, rolledOver: stale.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── TODOS CRUD ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { completed, priority, category, search, archived } = req.query;
    const isVault = archived === 'true';
    if (isVault) {
      const storedHash = await getSetting('historyPasscode');
      if (storedHash !== null) {
        const provided = req.headers['x-history-passcode'];
        if (!provided || hash(provided) !== storedHash) return res.status(401).json({ success:false, error:'Vault is locked', locked:true });
      }
    }
    const filter = { archived: isVault };
    if (completed !== undefined) filter.completed = completed === 'true';
    if (priority)  filter.priority = priority;
    if (category)  filter.category = category;
    if (search)    filter.text = { $regex: search, $options: 'i' };
    const todos = await Todo.find(filter).sort({ archivedAt: -1, createdAt: -1 });
    const todayStart = new Date(today()+'T00:00:00.000Z');
    const todayDone = await Todo.countDocuments({ archived:true, archivedAt:{ $gte:todayStart } });
    const balance = await getBalance();
    const stats = {
      total: await Todo.countDocuments({ archived:false }), completed: await Todo.countDocuments({ archived:true }),
      pending: await Todo.countDocuments({ archived:false, completed:false }), high: await Todo.countDocuments({ archived:false, priority:'high' }),
      archived: await Todo.countDocuments({ archived:true }), todayDone, coinBalance: balance,
    };
    res.json({ success: true, todos, stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try { const t = await Todo.findById(req.params.id); if (!t) return res.status(404).json({ success:false, error:'Not found' }); res.json({ success:true, todo:t }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { text, priority='medium', category='General', dueDate=null, tags=[], notes='' } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Text required' });
    const count = await Todo.countDocuments(), t = today();
    const todo = new Todo({ text:text.trim(), priority, category, dueDate, tags, notes, order:count, dayTag:t,
      history:[entry('created',`Task created — priority "${priority}", category "${category}"`,['text','priority','category'],null,{text:text.trim(),priority,category,dueDate})] });
    await todo.save(); res.status(201).json({ success: true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success: false, error: 'Not found' });
    const { text, priority, category, dueDate, tags, notes } = req.body, changes = [];
    if (text !== undefined && text.trim() !== todo.text) { changes.push(entry('edited','Text changed',['text'],todo.text,text.trim())); todo.text=text.trim(); }
    if (priority !== undefined && priority !== todo.priority) { changes.push(entry('priority_changed',`Priority: "${todo.priority}" → "${priority}"`,['priority'],todo.priority,priority)); todo.priority=priority; }
    if (category !== undefined && category.trim() !== todo.category) { changes.push(entry('category_changed',`Category: "${todo.category}" → "${category.trim()}"`,['category'],todo.category,category.trim())); todo.category=category.trim(); }
    if (dueDate !== undefined) { const nd=dueDate||null,od=todo.dueDate?todo.dueDate.toISOString().substring(0,10):null; if(nd!==od){changes.push(entry('due_date_changed',`Due date: "${od||'none'}" → "${nd||'none'}"`,['dueDate'],od,nd));todo.dueDate=nd;} }
    if (tags !== undefined) { const ot=JSON.stringify([...todo.tags].sort()),nt=JSON.stringify([...tags].sort()); if(ot!==nt){changes.push(entry('tags_changed','Tags updated',['tags'],todo.tags,tags));todo.tags=tags;} }
    if (notes !== undefined && notes.trim() !== todo.notes) { changes.push(entry('notes_changed','Notes updated',['notes'],todo.notes,notes.trim())); todo.notes=notes.trim(); }
    if (changes.length) todo.history.push(...changes);
    await todo.save(); res.json({ success: true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── TOGGLE (complete ↔ reopen) ────────────────────────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    const wasCompleted = todo.completed; todo.completed = !wasCompleted;
    let coinResult=null, streakBonusResult=null, firstTaskResult=null;
    if (todo.completed) {
      const now = new Date(); todo.archived=true; todo.archivedAt=now; todo.failed=false;
      todo.history.push(entry('completed','Task marked as completed',['completed'],false,true));
      todo.history.push(entry('archived',`Auto-archived to vault on ${now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`,['archived'],false,true));
      await bumpActivity(today(), 1);
      coinResult = await awardCoins(`task_complete_${todo.priority}`, todo._id, todo.text, `Completed: ${todo.text}`);
      const subs = todo.subtasks||[];
      if (subs.length>0 && subs.every(s=>s.completed)) { await awardCoins('subtasks_bonus',todo._id,todo.text,'All subtasks done!'); coinResult.subtasksBonus=COIN_VALUES.subtasks_bonus; }
      const tdc = await DailyActivity.findOne({ date:today() });
      if (tdc && tdc.count===1) firstTaskResult = await awardCoins('first_task_day',todo._id,todo.text,'First task of the day!');
      const streak = await getStreak(); if (streak>=2) streakBonusResult = await maybeAwardStreakBonus(streak);
    } else {
      todo.archived=false; todo.archivedAt=null; todo.failed=false; todo.dayTag=today();
      todo.history.push(entry('reopened','Task reopened and restored to active list',['completed','archived'],true,false));
      await bumpActivity(today(), -1); await bumpNegativeActivity(today(), 1);
      const orig = COIN_VALUES[`task_complete_${todo.priority}`]||0, pen = -(orig*PENALTY_MULTIPLIER);
      coinResult = await deductCoins('task_uncomplete',pen,todo._id,todo.text,`Reopened (2× penalty): ${todo.text}`);
      coinResult.penaltyMultiplier=PENALTY_MULTIPLIER; coinResult.originalReward=orig;
    }
    await todo.save();
    res.json({ success:true, todo, coinResult, streakBonusResult, firstTaskResult, coinBalance: await getBalance() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── FAIL — explicitly mark active task as NOT completed ───────────────────────
// • Archives with failed=true, completed=false
// • Bumps negative heatmap
// • Deducts 2× the coin reward for that priority
router.patch('/:id/fail', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo)         return res.status(404).json({ success:false, error:'Not found' });
    if (todo.archived) return res.status(400).json({ success:false, error:'Already archived' });

    const now = new Date();
    todo.archived   = true;
    todo.archivedAt = now;
    todo.completed  = false;
    todo.failed     = true;
    todo.history.push(entry(
      'failed',
      `Task marked as not completed on ${now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`,
      ['failed','archived'], false, true
    ));

    await bumpNegativeActivity(today(), 1);

    const orig = COIN_VALUES[`task_complete_${todo.priority}`] || 0;
    const pen  = -(orig * PENALTY_MULTIPLIER);
    const coinResult = await deductCoins('task_fail', pen, todo._id, todo.text, `Not completed (2× penalty): ${todo.text}`);
    coinResult.originalReward    = orig;
    coinResult.penaltyMultiplier = PENALTY_MULTIPLIER;

    await todo.save();
    res.json({ success:true, todo, coinResult, coinBalance: await getBalance() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ARCHIVE / UNARCHIVE ───────────────────────────────────────────────────────
router.patch('/:id/archive', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    if (todo.archived) return res.status(400).json({ success:false, error:'Already archived' });
    const now = new Date(); todo.archived=true; todo.archivedAt=now; todo.completed=true;
    todo.history.push(entry('archived',`Manually archived on ${now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`,['archived','completed'],false,true));
    await todo.save(); res.json({ success:true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.patch('/:id/unarchive', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    if (!todo.archived) return res.status(400).json({ success:false, error:'Not in vault' });
    const now = new Date(); todo.archived=false; todo.archivedAt=null; todo.completed=false; todo.failed=false; todo.dayTag=today();
    todo.history.push(entry('unarchived',`Restored from vault on ${now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`,['archived','completed'],true,false));
    await todo.save(); res.json({ success:true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── SUBTASKS ──────────────────────────────────────────────────────────────────
router.post('/:id/subtasks', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    if (!req.body.text?.trim()) return res.status(400).json({ success:false, error:'Text required' });
    todo.subtasks.push({ text: req.body.text.trim() }); await todo.save(); res.json({ success:true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.patch('/:id/subtasks/:sid/toggle', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    const sub = todo.subtasks.id(req.params.sid);
    if (!sub) return res.status(404).json({ success:false, error:'Subtask not found' });
    sub.completed = !sub.completed; await todo.save(); res.json({ success:true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.delete('/:id/subtasks/:sid', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    todo.subtasks.pull(req.params.sid); await todo.save(); res.json({ success:true, todo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    res.json({ success:true, wasArchived: todo.archived });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
router.delete('/bulk/completed', async (req, res) => {
  try { const r = await Todo.deleteMany({ completed:true, archived:false }); res.json({ success:true, deleted:r.deletedCount }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── HISTORY ───────────────────────────────────────────────────────────────────
router.get('/:id/history', async (req, res) => {
  try {
    const storedHash = await getSetting('historyPasscode');
    if (storedHash !== null) {
      const provided = req.headers['x-history-passcode'];
      if (!provided || hash(provided) !== storedHash) return res.status(401).json({ success:false, error:'Passcode required', locked:true });
    }
    const todo = await Todo.findById(req.params.id).select('text history');
    if (!todo) return res.status(404).json({ success:false, error:'Not found' });
    res.json({ success:true, text:todo.text, history:todo.history.slice().reverse() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;