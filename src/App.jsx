import { useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const PLAN_START = "2026-03-22";
const TRIP_DATE  = "2026-06-03";

const PHASE_MAP = {
  1: { label:"Phase 1 — Re-Entry",    color:"#38bdf8" },
  2: { label:"Phase 2 — Volume Build",color:"#fb923c" },
  3: { label:"Phase 3 — Peak",        color:"#a78bfa" },
};

const WORKOUT_A = [
  { id:"squat",    name:"Squat",             type:"main", scheme:"5×5",      isMain:true  },
  { id:"bench",    name:"DB Floor Press*",   type:"main", scheme:"5×5",      isMain:true  },
  { id:"row",      name:"Barbell Row",       type:"main", scheme:"5×5",      isMain:true  },
  { id:"incline",  name:"Incline DB Press",  type:"acc",  scheme:"3×12",     isMain:false },
  { id:"lateral",  name:"DB Lateral Raise",  type:"acc",  scheme:"3×15-20",  isMain:false },
  { id:"facepull", name:"Face Pull",         type:"acc",  scheme:"3×15-20",  isMain:false },
  { id:"curl",     name:"DB Curl",           type:"acc",  scheme:"3×10-12",  isMain:false },
  { id:"pushdown", name:"Tricep Pushdown",   type:"acc",  scheme:"3×12-15",  isMain:false },
  { id:"rdl",      name:"DB Romanian DL",    type:"acc",  scheme:"3×10",     isMain:false },
  { id:"abs_a",    name:"Ab Wheel / Plank",  type:"acc",  scheme:"3×10/45s", isMain:false },
  { id:"hip",      name:"Hip Flexor Stretch",type:"mob",  scheme:"3×45-60s", isMain:false },
  { id:"tspin",    name:"Thoracic Opener",   type:"mob",  scheme:"3×45-60s", isMain:false },
  { id:"ham",      name:"Hamstring Stretch", type:"mob",  scheme:"3×45-60s", isMain:false },
];

const WORKOUT_B = [
  { id:"deadlift", name:"Deadlift",           type:"main", scheme:"3×5",      isMain:true  },
  { id:"ohp",      name:"Overhead Press",     type:"main", scheme:"5×5",      isMain:true  },
  { id:"pullup",   name:"Pull-Ups",           type:"main", scheme:"3×8",      isMain:true  },
  { id:"incline2", name:"Incline DB Press",   type:"acc",  scheme:"3×12",     isMain:false },
  { id:"lateral2", name:"DB Lateral Raise",   type:"acc",  scheme:"3×15-20",  isMain:false },
  { id:"facepull2",name:"Face Pull",          type:"acc",  scheme:"3×15-20",  isMain:false },
  { id:"curl2",    name:"DB Curl",            type:"acc",  scheme:"3×10-12",  isMain:false },
  { id:"pushdown2",name:"Tricep Pushdown",    type:"acc",  scheme:"3×12-15",  isMain:false },
  { id:"bss",      name:"Bulgarian Split Sq", type:"acc",  scheme:"3×8 each", isMain:false },
  { id:"abwheel",  name:"Ab Wheel",           type:"acc",  scheme:"3×10-15",  isMain:false },
  { id:"hip2",     name:"Hip Flexor Stretch", type:"mob",  scheme:"3×45-60s", isMain:false },
  { id:"tspin2",   name:"Thoracic Opener",    type:"mob",  scheme:"3×45-60s", isMain:false },
  { id:"ham2",     name:"Hamstring Stretch",  type:"mob",  scheme:"3×45-60s", isMain:false },
];

const MAIN_LIFTS = {
  squat:    { label:"Squat",             increment:5, totalSets:5 },
  bench:    { label:"Bench/Floor Press", increment:5, totalSets:5 },
  row:      { label:"Barbell Row",       increment:5, totalSets:5 },
  deadlift: { label:"Deadlift",          increment:5, totalSets:3 },
  ohp:      { label:"Overhead Press",    increment:5, totalSets:5 },
};
const MAIN_LIFT_IDS = Object.keys(MAIN_LIFTS);
const DEFAULT_WEIGHTS = { squat:245, bench:135, row:120, deadlift:275, ohp:95 };

const MORNING_MOBILITY = [
  "90/90 Hip Stretch — 60s each side",
  "World's Greatest Stretch — 5 reps each",
  "Cat-Cow — 10 slow reps",
  "Thread the Needle — 5 reps each",
  "Deep Squat Hold — 2×30s",
];
const SHOULDER_WARMUP = [
  "Arm circles — 15 fwd, 15 back",
  "Band pull-aparts — 2×20",
  "Shoulder CARs — 5 circles each direction",
  "Wall slides — 2×10",
];

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const today       = () => new Date().toISOString().split("T")[0];
const getWeek     = (d) => Math.min(Math.max(Math.floor((new Date(d)-new Date(PLAN_START))/(7*864e5))+1,1),10);
const getPhase    = (w) => w<=3?1:w<=7?2:3;
const getDaysLeft = () => Math.max(0,Math.ceil((new Date(TRIP_DATE)-new Date())/864e5));
const fmtDate     = (s) => new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
const roundN      = (v,n) => Math.round(v/n)*n;

/* ─────────────────────────────────────────────
   LOCALSTORAGE HOOK
   Replaces the window.storage Claude artifact API.
   Synchronous, so no async needed — "loaded" is
   always true immediately.
───────────────────────────────────────────── */
function useStorage(key, defaultVal) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultVal;
    } catch (_) {
      return defaultVal;
    }
  });

  const save = useCallback((newVal) => {
    const v = typeof newVal === "function" ? newVal(val) : newVal;
    setVal(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (_) {}
  }, [key, val]);

  return [val, save];
}

/* ─────────────────────────────────────────────
   PROGRESSION ENGINE
───────────────────────────────────────────── */
function calcProgression(liftId, currentWeight, allSetsCompleted, currentFailures) {
  if (!MAIN_LIFTS[liftId]) return { newWeight:currentWeight, newFailures:currentFailures, event:null };
  const { increment } = MAIN_LIFTS[liftId];
  if (allSetsCompleted) {
    return { newWeight: currentWeight + increment, newFailures: 0, event: "increased" };
  }
  const nf = (currentFailures || 0) + 1;
  if (nf >= 3) {
    return { newWeight: roundN(currentWeight * 0.9, 5), newFailures: 0, event: "deload" };
  }
  return { newWeight: currentWeight, newFailures: nf, event: "repeat" };
}

/* ─────────────────────────────────────────────
   APP ROOT
───────────────────────────────────────────── */
export default function App() {
  const [tab,      setTab]      = useState("today");
  const [wkView,   setWkView]   = useState(null);
  const [alerts,   setAlerts]   = useState([]);
  const [viewDate, setViewDate] = useState(today);

  const [weights,  saveWeights]  = useStorage("rc_weights",  DEFAULT_WEIGHTS);
  const [failures, saveFailures] = useStorage("rc_failures", {});
  const [logs,     saveLogs]     = useStorage("rc_logs",     {});
  const [sessions, saveSessions] = useStorage("rc_sessions", []);

  const todayStr  = today();
  const week      = getWeek(todayStr);
  const phase     = getPhase(week);
  const daysLeft  = getDaysLeft();
  const viewLog   = logs[viewDate] || {};
  const viewSess  = sessions.find(s => s.date === viewDate);
  const todaySess = sessions.find(s => s.date === todayStr);
  const totalDone = sessions.filter(s => s.completed).length;

  const shiftDate = (days) => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    const next = d.toISOString().split("T")[0];
    if (next <= todayStr) setViewDate(next);
  };

  const streak = (() => {
    let s = 0, d = new Date(todayStr);
    while (true) {
      const ds = d.toISOString().split("T")[0];
      if (sessions.find(x => x.date === ds && x.completed)) { s++; d.setDate(d.getDate()-1); }
      else break;
    }
    return s;
  })();

  const updateLog = (u) => saveLogs(p => ({ ...p, [viewDate]: { ...p[viewDate], ...u } }));

  const handleComplete = (type, results) => {
    const newW = {...weights}, newF = {...failures}, newAlerts = [];
    Object.entries(results).forEach(([id, {weight, allDone}]) => {
      if (!MAIN_LIFTS[id]) return;
      const { newWeight, newFailures, event } = calcProgression(id, weight, allDone, failures[id]||0);
      newW[id] = newWeight; newF[id] = newFailures;
      if (event) newAlerts.push({ id, event, from: weight, to: newWeight });
    });
    saveWeights(newW);
    saveFailures(newF);
    saveSessions(p => [...p.filter(s => s.date !== todayStr), {
      date: todayStr, type, completed: true,
      lifts: Object.fromEntries(Object.entries(results).map(([id,r]) => [id, r.weight]))
    }]);
    setAlerts(newAlerts);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#060c16", color:"#e2e8f0",
      fontFamily:"'DM Sans','Segoe UI',sans-serif", maxWidth:540, margin:"0 auto", paddingBottom:100 }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={{ background:"linear-gradient(135deg,#0c1525,#0f1e38)", padding:"18px 20px 14px",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        borderBottom:"1px solid #1e2d4a", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:"0.22em", color:"#38bdf8" }}>RECOMP</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <Chip label={`Week ${week}`} />
            <Chip label={PHASE_MAP[phase].label} color={PHASE_MAP[phase].color} />
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:32, fontWeight:900, color:"#e2e8f0", lineHeight:1 }}>{daysLeft}</div>
          <div style={{ fontSize:11, color:"#475569" }}>days to Saint Lucia</div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:"flex", background:"#0a1525", borderBottom:"1px solid #1e293b",
        position:"sticky", top:70, zIndex:49 }}>
        {[{id:"today",icon:"☀",label:"Today"},{id:"workout",icon:"🏋",label:"Workout"},
          {id:"progress",icon:"📈",label:"Progress"},{id:"plan",icon:"📋",label:"Plan"}].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setWkView(null); }}
            style={{ flex:1, padding:"10px 4px", background:"none", border:"none",
              color: tab===t.id ? "#38bdf8" : "#475569", cursor:"pointer", fontSize:11,
              fontWeight:700, display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              borderBottom: tab===t.id ? "2px solid #38bdf8" : "2px solid transparent" }}>
            <span style={{ fontSize:18 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      <main style={{ padding:"20px 16px" }}>
        {tab==="today"    && <TodayTab    week={week} phase={phase} log={viewLog} sess={viewSess} streak={streak} total={totalDone} updateLog={updateLog} goWorkout={() => setTab("workout")} weights={weights} failures={failures} viewDate={viewDate} todayStr={todayStr} shiftDate={shiftDate} />}
        {tab==="workout"  && <WorkoutTab  wkView={wkView} setWkView={setWkView} weights={weights} sessions={sessions} todayStr={todayStr} todaySess={todaySess} onComplete={handleComplete} alerts={alerts} setAlerts={setAlerts} failures={failures} />}
        {tab==="progress" && <ProgressTab sessions={sessions} weights={weights} logs={logs} streak={streak} total={totalDone} failures={failures} />}
        {tab==="plan"     && <PlanTab     week={week} phase={phase} />}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TODAY TAB
───────────────────────────────────────────── */
function TodayTab({ week, phase, log, sess, streak, total, updateLog, goWorkout, weights, failures, viewDate, todayStr, shiftDate }) {
  const isToday   = viewDate === todayStr;
  const steps     = log.steps || 0;
  const stepGoal  = week<=2?7000:week<=4?9000:week<=6?10500:12000;
  const pct       = Math.min(100, Math.round(steps/stepGoal*100));

  const displayDate = isToday ? "Today" : new Date(viewDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

  return (
    <div className="fadein">

      {/* DATE NAVIGATOR */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"#0d1829", border:"1px solid #1e293b", borderRadius:12,
        padding:"10px 14px", marginBottom:16 }}>
        <button onClick={() => shiftDate(-1)}
          style={{ background:"#0a1525", border:"1px solid #1e293b", borderRadius:8,
            color:"#94a3b8", fontSize:18, fontWeight:700, width:36, height:36,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          ‹
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:700, color: isToday ? "#38bdf8" : "#e2e8f0", fontSize:16 }}>
            {displayDate}
          </div>
          {!isToday && (
            <button onClick={() => shiftDate(999)}
              style={{ background:"none", border:"none", color:"#475569", fontSize:11,
                cursor:"pointer", marginTop:2, textDecoration:"underline" }}>
              back to today
            </button>
          )}
        </div>
        <button onClick={() => shiftDate(1)}
          disabled={isToday}
          style={{ background:"#0a1525", border:"1px solid #1e293b", borderRadius:8,
            color: isToday ? "#1e293b" : "#94a3b8", fontSize:18, fontWeight:700,
            width:36, height:36, cursor: isToday ? "default" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          ›
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        <StatCard label="Streak"   value={streak} unit="days"  color="#f59e0b" />
        <StatCard label="Sessions" value={total}  unit="total" color="#38bdf8" />
        <StatCard label="Week"     value={week}   unit="of 10" color={PHASE_MAP[phase].color} />
      </div>

      <Card title="Next Session Weights">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {MAIN_LIFT_IDS.map(id => {
            const f = failures[id] || 0;
            return (
              <div key={id} style={{ background:"#0a1525", borderRadius:8, padding:"8px 10px", border:"1px solid #1e293b" }}>
                <div style={{ fontSize:11, color:"#475569", marginBottom:2 }}>{MAIN_LIFTS[id].label}</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                  <span style={{ fontSize:20, fontWeight:900, color:"#e2e8f0" }}>{weights[id]}</span>
                  <span style={{ fontSize:12, color:"#475569" }}>lbs</span>
                </div>
                {f > 0 && (
                  <div style={{ fontSize:11, marginTop:2, color:f>=2?"#f87171":"#f59e0b" }}>
                    {f>=2 ? "⚠️ 1 miss from deload" : `⚡ ${f}/3 misses`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontWeight:700, color:"#e2e8f0", fontSize:15 }}>Daily Steps</span>
          <span style={{ fontSize:13, color:pct>=100?"#4ade80":"#94a3b8" }}>Goal: {stepGoal.toLocaleString()}</span>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input type="number" placeholder="Enter steps" value={steps||""}
            onChange={e => updateLog({ steps: parseInt(e.target.value)||0 })}
            style={{ flex:1, background:"#0a1525", border:"1px solid #1e3a5f", borderRadius:8,
              color:"#e2e8f0", fontSize:22, fontWeight:700, padding:"8px 12px", outline:"none", fontFamily:"inherit" }} />
          <span style={{ fontSize:22, fontWeight:700, color:pct>=100?"#4ade80":"#cbd5e1", minWidth:52, textAlign:"right" }}>
            {pct}%
          </span>
        </div>
        <div style={{ height:6, background:"#1e293b", borderRadius:99, overflow:"hidden", marginTop:10 }}>
          <div style={{ height:"100%", borderRadius:99, width:`${pct}%`,
            background:pct>=100?"#4ade80":"#38bdf8", transition:"width 0.4s" }} />
        </div>
        <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
          {steps >= stepGoal ? "✅ Goal crushed!" : `${(stepGoal-steps).toLocaleString()} to go`}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight:700, color:"#e2e8f0", fontSize:15, marginBottom:10 }}>
          {isToday ? "Today's Workout" : "Workout"}
        </div>
        {sess?.completed
          ? <div style={{ color:"#4ade80", fontWeight:700 }}>✅ Workout {sess.type} complete!</div>
          : isToday
            ? <button onClick={goWorkout} style={{ background:"linear-gradient(135deg,#1d4ed8,#0369a1)",
                color:"#fff", border:"none", borderRadius:10, padding:"12px 24px", fontSize:15, fontWeight:700, cursor:"pointer" }}>
                Log Workout →
              </button>
            : <div style={{ color:"#475569", fontSize:13 }}>No workout logged this day.</div>}
      </Card>

      <Card title="Morning Mobility">
        {MORNING_MOBILITY.map((item, i) => (
          <CheckItem key={i} label={item} checked={!!log[`mob_${i}`]} onChange={v => updateLog({ [`mob_${i}`]: v })} />
        ))}
      </Card>

      <Card title="Shoulder Warm-Up">
        {SHOULDER_WARMUP.map((item, i) => (
          <CheckItem key={i} label={item} checked={!!log[`sh_${i}`]} onChange={v => updateLog({ [`sh_${i}`]: v })} />
        ))}
      </Card>

      <Card title="Nutrition & Recovery">
        {[
          { k:"meal1",   l:"Meal 1 eaten (pre-workout / morning)" },
          { k:"meal2",   l:"Meal 2 eaten (post-workout / evening)" },
          { k:"protein", l:"Hit 180–200g protein target" },
          { k:"nobing",  l:"No binge episode today" },
          { k:"screen",  l:"Screen-free wind-down before bed" },
          { k:"sleep8",  l:"8+ hrs sleep last night" },
        ].map(({ k, l }) => (
          <CheckItem key={k} label={l} checked={!!log[k]} onChange={v => updateLog({ [k]: v })} />
        ))}
      </Card>

      <Card title="Sleep Last Night">
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[5,6,6.5,7,7.5,8,8.5,9].map(h => (
            <button key={h} onClick={() => updateLog({ sleep: h })}
              style={{ background:log.sleep===h?"#1e3a5f":"#0a1525",
                border:`1px solid ${log.sleep===h?"#38bdf8":"#1e293b"}`,
                borderRadius:8, color:log.sleep===h?"#38bdf8":"#64748b",
                fontSize:13, fontWeight:700, padding:"6px 10px", cursor:"pointer" }}>
              {h}h
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WORKOUT TAB
───────────────────────────────────────────── */
function WorkoutTab({ wkView, setWkView, weights, sessions, todayStr, todaySess, onComplete, alerts, setAlerts, failures }) {
  const [sets,  setSets]  = useState({});
  const [wOver, setWOver] = useState({});
  const [done,  setDone]  = useState(false);

  const exs     = wkView==="A" ? WORKOUT_A : wkView==="B" ? WORKOUT_B : [];
  const recent  = [...sessions].reverse().slice(0, 5);
  const getSets = (scheme) => parseInt((scheme.match(/^(\d+)/)||[0,3])[1]);
  const allDone = (id, n)  => Array.from({length:n}).every((_,i) => sets[`${id}_${i}`]);
  const toggle  = (id, i)  => setSets(p => ({ ...p, [`${id}_${i}`]: !p[`${id}_${i}`] }));

  const finish = () => {
    const results = {};
    MAIN_LIFT_IDS.forEach(id => {
      const ex = exs.find(e => e.id === id);
      if (!ex) return;
      results[id] = { weight: parseFloat(wOver[id]) || weights[id], allDone: allDone(id, getSets(ex.scheme)) };
    });
    onComplete(wkView, results);
    setDone(true);
  };

  if (!wkView) return (
    <div className="fadein">
      {todaySess?.completed && (
        <div style={{ background:"#052e16aa", border:"1px solid #4ade8044", borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
          <span style={{ color:"#4ade80", fontWeight:700 }}>✅ Workout {todaySess.type} already logged</span>
        </div>
      )}
      <div style={{ fontWeight:700, color:"#e2e8f0", fontSize:18, marginBottom:16 }}>Choose Workout</div>
      <div style={{ display:"flex", gap:14 }}>
        {["A","B"].map(t => (
          <button key={t} onClick={() => { setWkView(t); setDone(false); setSets({}); setWOver({}); setAlerts([]); }}
            style={{ flex:1, background:"#0d1829", border:"1px solid #1e293b", borderRadius:16,
              padding:"24px 16px", cursor:"pointer", textAlign:"center" }}>
            <div style={{ fontSize:48, fontWeight:900, color:t==="A"?"#38bdf8":"#a78bfa", lineHeight:1 }}>{t}</div>
            <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>
              {t==="A" ? "Squat · Bench · Row" : "Deadlift · OHP · Pulls"}
            </div>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div style={{ fontWeight:700, color:"#e2e8f0", fontSize:15, margin:"24px 0 10px" }}>Recent</div>
          {recent.map((s, i) => (
            <div key={i} style={{ background:"#0d1829", border:"1px solid #1e293b", borderRadius:10,
              padding:"10px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#94a3b8", fontSize:13 }}>{fmtDate(s.date)}</span>
              <span style={{ color:s.type==="A"?"#38bdf8":"#a78bfa", fontWeight:700 }}>Workout {s.type}</span>
              <span style={{ color:"#4ade80" }}>✅</span>
            </div>
          ))}
        </>
      )}
    </div>
  );

  if (done) return (
    <div className="fadein" style={{ textAlign:"center", padding:"32px 16px" }}>
      <div style={{ fontSize:56, marginBottom:12 }}>🔥</div>
      <div style={{ fontSize:26, fontWeight:900, color:"#4ade80", marginBottom:6 }}>Workout {wkView} Done!</div>
      {alerts.length > 0 && (
        <div style={{ marginBottom:20, marginTop:16 }}>
          <div style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:"0.1em",
            textTransform:"uppercase", marginBottom:10 }}>Weight Updates</div>
          {alerts.map((a, i) => {
            const up=a.event==="increased", dl=a.event==="deload";
            return (
              <div key={i} style={{ background:dl?"#1c0a0a":up?"#052e16":"#1c1400",
                border:`1px solid ${dl?"#f8717144":up?"#4ade8044":"#f59e0b44"}`,
                borderRadius:12, padding:"10px 14px", marginBottom:8,
                display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left" }}>
                <div>
                  <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{MAIN_LIFTS[a.id]?.label}</div>
                  <div style={{ fontSize:12, marginTop:2, color:dl?"#f87171":up?"#4ade80":"#f59e0b" }}>
                    {up && "✅ All sets — weight increased!"}
                    {dl && "⚠️ 3 misses — 10% deload applied"}
                    {!up && !dl && "🔁 Repeat this weight next session"}
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, color:"#475569", textDecoration:"line-through" }}>{a.from} lbs</div>
                  <div style={{ fontSize:20, fontWeight:900, color:dl?"#f87171":up?"#4ade80":"#f59e0b" }}>{a.to} lbs</div>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize:13, color:"#64748b", marginTop:8 }}>Next session weights updated automatically.</div>
        </div>
      )}
      <button onClick={() => setWkView(null)} style={{ background:"linear-gradient(135deg,#1d4ed8,#0369a1)",
        color:"#fff", border:"none", borderRadius:10, padding:"12px 28px", fontSize:15, fontWeight:700, cursor:"pointer" }}>
        ← Back
      </button>
    </div>
  );

  const sections = [
    { label:"⚡ Main Lifts",  f: e => e.type==="main" },
    { label:"💪 Accessories", f: e => e.type==="acc"  },
    { label:"🧘 Mobility",    f: e => e.type==="mob"  },
  ];

  return (
    <div className="fadein">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setWkView(null)} style={{ background:"none", border:"none",
          color:"#94a3b8", cursor:"pointer", fontSize:22, padding:4 }}>←</button>
        <div style={{ fontSize:22, fontWeight:900, color:wkView==="A"?"#38bdf8":"#a78bfa" }}>Workout {wkView}</div>
      </div>

      {sections.map(sec => {
        const list = exs.filter(sec.f);
        if (!list.length) return null;
        return (
          <div key={sec.label} style={{ marginBottom:22 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:"0.12em",
              textTransform:"uppercase", marginBottom:8 }}>{sec.label}</div>
            {list.map(ex => {
              const n  = getSets(ex.scheme);
              const ad = ex.type!=="mob" && allDone(ex.id, n);
              const f  = failures[ex.id] || 0;
              return (
                <div key={ex.id} style={{ background:"#0d1829",
                  border:`1px solid ${ad?"#4ade8033":"#1e293b"}`, borderRadius:12,
                  padding:"12px 14px", marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, color:"#e2e8f0", fontSize:14 }}>{ex.name}</div>
                      <div style={{ fontSize:12, color:"#4a6fa5", marginTop:1 }}>{ex.scheme}</div>
                      {ex.isMain && f > 0 && (
                        <div style={{ fontSize:11, marginTop:2, color:f>=2?"#f87171":"#f59e0b" }}>
                          {f>=2 ? `⚠️ ${f}/3 — next miss = deload` : `⚡ ${f}/3 misses`}
                        </div>
                      )}
                    </div>
                    {ex.isMain && (
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                        <span style={{ color:"#64748b", fontSize:11 }}>lbs</span>
                        <input type="number"
                          value={wOver[ex.id] ?? weights[ex.id] ?? ""}
                          placeholder={weights[ex.id]}
                          onChange={e => setWOver(p => ({ ...p, [ex.id]: e.target.value }))}
                          style={{ width:60, background:"#0a1525", border:"1px solid #1e3a5f",
                            borderRadius:8, color:"#38bdf8", fontSize:16, fontWeight:700,
                            padding:"5px 6px", outline:"none", fontFamily:"inherit", textAlign:"center" }} />
                      </div>
                    )}
                  </div>
                  {ex.type !== "mob" ? (
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                      {Array.from({length:n}).map((_, i) => {
                        const done = sets[`${ex.id}_${i}`];
                        return (
                          <button key={i} onClick={() => toggle(ex.id, i)}
                            style={{ background:done?"#052e16":"#0a1525",
                              border:`1px solid ${done?"#4ade80":"#1e3a5f"}`,
                              borderRadius:8, color:done?"#4ade80":"#64748b",
                              fontSize:12, fontWeight:700, padding:"6px 11px", cursor:"pointer", minWidth:52 }}>
                            {done ? "✓" : `Set ${i+1}`}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <CheckItem label="Completed"
                      checked={!!sets[`${ex.id}_0`]}
                      onChange={v => setSets(p => ({ ...p, [`${ex.id}_0`]: v }))} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <button onClick={finish} style={{ background:"linear-gradient(135deg,#1d4ed8,#0369a1)",
        color:"#fff", border:"none", borderRadius:10, padding:"14px", fontSize:15,
        fontWeight:700, cursor:"pointer", width:"100%", marginTop:4 }}>
        Complete Workout ✓
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PROGRESS TAB
───────────────────────────────────────────── */
function ProgressTab({ sessions, weights, logs, streak, total, failures }) {
  const [sel, setSel] = useState("squat");

  const liftData = (() => {
    const pts = sessions.filter(s => s.completed && s.lifts?.[sel])
      .map(s => ({ date: fmtDate(s.date), weight: s.lifts[sel], raw: s.date }))
      .sort((a,b) => a.raw > b.raw ? 1 : -1);
    return pts.length ? pts : [{ date:"Start", weight:weights[sel], raw:PLAN_START }];
  })();

  const stepData = Object.entries(logs)
    .filter(([_,v]) => v.steps > 0)
    .map(([d,v]) => ({ date:fmtDate(d), steps:v.steps, raw:d }))
    .sort((a,b) => a.raw > b.raw ? 1 : -1).slice(-14);

  const habitPct = (() => {
    const days = Object.values(logs);
    if (!days.length) return 0;
    return Math.round(days.map(d =>
      ["meal1","meal2","protein","nobing","screen","sleep8"].filter(k => d[k]).length / 6 * 100
    ).reduce((a,b) => a+b, 0) / days.length);
  })();

  return (
    <div className="fadein">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        <StatCard label="Streak"   value={streak} unit="days"  color="#f59e0b" />
        <StatCard label="Sessions" value={total}  unit="total" color="#38bdf8" />
        <StatCard label="Week"     value={week}   unit="of 10" color={PHASE_MAP[phase].color} />
      </div>
        <StatCard label="Streak"   value={streak}   unit="days"   color="#f59e0b" />
        <StatCard label="Sessions" value={total}    unit="logged" color="#38bdf8" />
        <StatCard label="Habits"   value={habitPct} unit="%"      color="#4ade80" />
      </div>

      <Card title="Lift Progression">
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>
          {MAIN_LIFT_IDS.map(id => (
            <button key={id} onClick={() => setSel(id)}
              style={{ background:sel===id?"#1e3a5f":"#0a1525",
                border:`1px solid ${sel===id?"#38bdf8":"#1e293b"}`, borderRadius:20,
                color:sel===id?"#38bdf8":"#475569", fontSize:11, fontWeight:700,
                padding:"3px 10px", cursor:"pointer" }}>
              {MAIN_LIFTS[id].label.split(" ")[0]}
            </button>
          ))}
        </div>
        {liftData.length > 1 ? (
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={liftData} margin={{ top:4, right:8, bottom:4, left:-20 }}>
              <XAxis dataKey="date" tick={{ fill:"#64748b", fontSize:11 }} />
              <YAxis tick={{ fill:"#64748b", fontSize:11 }} domain={["auto","auto"]} />
              <Tooltip contentStyle={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color:"#e2e8f0" }} />
              <Line type="monotone" dataKey="weight" stroke="#38bdf8" strokeWidth={2.5} dot={{ fill:"#38bdf8", r:4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color:"#475569", fontSize:13, padding:"16px 0" }}>
            Log workouts to see chart. Current: <span style={{ color:"#38bdf8", fontWeight:700 }}>{weights[sel]} lbs</span>
          </div>
        )}
      </Card>

      <Card title="Working Weights & Status">
        {MAIN_LIFT_IDS.map(id => {
          const f = failures[id] || 0;
          const diff = weights[id] - DEFAULT_WEIGHTS[id];
          return (
            <div key={id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"9px 0", borderBottom:"1px solid #1e293b" }}>
              <div>
                <div style={{ color:"#cbd5e1", fontSize:13, fontWeight:600 }}>{MAIN_LIFTS[id].label}</div>
                {f > 0
                  ? <div style={{ fontSize:11, color:f>=2?"#f87171":"#f59e0b", marginTop:1 }}>{f}/3 misses{f>=2?" — near deload!":""}</div>
                  : <div style={{ fontSize:11, color:"#4ade80", marginTop:1 }}>On track ✓</div>}
              </div>
              <div style={{ textAlign:"right" }}>
                {diff !== 0 && <div style={{ fontSize:11, color:diff>0?"#4ade80":"#f87171" }}>{diff>0?"+":""}{diff} lbs</div>}
                <div style={{ fontSize:18, fontWeight:900, color:"#e2e8f0" }}>{weights[id]} lbs</div>
              </div>
            </div>
          );
        })}
      </Card>

      {stepData.length > 0 && (
        <Card title="Steps — Last 14 Days">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={stepData} margin={{ top:4, right:8, bottom:4, left:-24 }}>
              <XAxis dataKey="date" tick={{ fill:"#64748b", fontSize:10 }} />
              <YAxis tick={{ fill:"#64748b", fontSize:10 }} />
              <Tooltip contentStyle={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color:"#e2e8f0" }} />
              <Line type="monotone" dataKey="steps" stroke="#4ade80" strokeWidth={2.5} dot={{ fill:"#4ade80", r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PLAN TAB
───────────────────────────────────────────── */
function PlanTab({ week, phase }) {
  const [sec, setSec] = useState("phases");
  const btnStyle = (id) => ({
    background: sec===id ? "#1e3a5f" : "#0a1525",
    border: `1px solid ${sec===id ? "#38bdf8" : "#1e293b"}`,
    borderRadius:20, color: sec===id ? "#38bdf8" : "#475569",
    fontSize:12, fontWeight:700, padding:"4px 12px", cursor:"pointer"
  });

  return (
    <div className="fadein">
      <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        {[["phases","Phases"],["nutrition","Nutrition"],["shoulder","Shoulder"],["milestones","Goals"]].map(([id,l]) => (
          <button key={id} onClick={() => setSec(id)} style={btnStyle(id)}>{l}</button>
        ))}
      </div>

      {sec==="phases" && [
        { p:1, w:"1–3",  c:"#38bdf8", t:"Re-Entry & Movement Quality",
          b:["3×/week: A/B/A, B/A/B","DB Floor Press — not barbell bench","Deadlift: 1×5 top + 2×3","Focus: consistency + shoulder health","Shoulder warm-up every session"] },
        { p:2, w:"4–7",  c:"#fb923c", t:"Volume Build",
          b:["4×/week: A/B/A/B","5 lbs added when all sets complete","Reintroduce barbell bench if shoulder clears ×3","Step goal: 10,500+"] },
        { p:3, w:"8–10", c:"#a78bfa", t:"Peak & Show-Ready",
          b:["4×/week, max intensity","Week 10 = 40% volume deload","Keep protein high, cut sodium Week 10","Step goal: 12,000+"] },
      ].map(x => (
        <div key={x.p} style={{ background:"#0d1829", border:"1px solid #1e293b",
          borderLeft:`4px solid ${x.c}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:6 }}>
            <span style={{ color:x.c, fontWeight:900, fontSize:18 }}>Phase {x.p}</span>
            <span style={{ color:"#475569", fontSize:12 }}>Weeks {x.w}</span>
            {phase===x.p && <span style={{ background:x.c+"22", color:x.c, fontSize:10,
              fontWeight:700, padding:"1px 7px", borderRadius:20, border:`1px solid ${x.c}44` }}>CURRENT</span>}
          </div>
          <div style={{ fontWeight:700, color:"#e2e8f0", marginBottom:6, fontSize:13 }}>{x.t}</div>
          {x.b.map((b,i) => (
            <div key={i} style={{ color:"#94a3b8", fontSize:12, padding:"2px 0 2px 12px", position:"relative" }}>
              <span style={{ position:"absolute", left:0, color:x.c }}>›</span>{b}
            </div>
          ))}
        </div>
      ))}

      {sec==="nutrition" && (
        <>
          <div style={{ background:"#1c1a0c99", border:"1px solid #f59e0b44", borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
            <span style={{ color:"#f59e0b", fontWeight:700 }}>⚠️ Rule: </span>
            <span style={{ color:"#cbd5e1", fontSize:13 }}>Min 2 meals on ALL training days. OMAD + deficit + training = binge risk.</span>
          </div>
          {[
            { t:"Protein Target",    b:"180–200g/day. Anchor every meal around protein." },
            { t:"Weeks 1–4 Reset",   b:"Remove seed oils, refined sugar, gluten. Daily sardines for omega-3s." },
            { t:"Pre-Workout Meal",  b:"Protein + fruit (berries/mango) 1–2 hrs before session." },
            { t:"Binge Prevention",  b:"Remove trigger foods from home. If urge hits: eat a large protein meal immediately." },
            { t:"Weekly Flex Meal",  b:"One planned higher-calorie meal per week reduces binge pressure." },
          ].map((r, i) => (
            <div key={i} style={{ background:"#0d1829", border:"1px solid #1e293b", borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
              <div style={{ fontWeight:700, color:"#38bdf8", fontSize:13, marginBottom:4 }}>{r.t}</div>
              <div style={{ color:"#94a3b8", fontSize:13, lineHeight:1.6 }}>{r.b}</div>
            </div>
          ))}
        </>
      )}

      {sec==="shoulder" && (
        <>
          <div style={{ background:"#1c0a0a99", border:"1px solid #f8717144", borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
            <span style={{ color:"#f87171", fontWeight:700 }}>⚠️ Sharp pain = stop the set. </span>
            <span style={{ color:"#cbd5e1", fontSize:13 }}>Continue physio exercises alongside this plan.</span>
          </div>
          {[
            "Use DB Floor Press until zero sharp pain for 3 consecutive sessions",
            "Pre-session shoulder warm-up — every session, no exceptions",
            "Stop immediately if sharp pain occurs — never push through",
            "Elbows at 45–60° from torso on all pressing",
            "Narrow grip on pressing movements",
            "Face pulls and lateral raises are rehabilitative — never skip them",
          ].map((r, i) => (
            <div key={i} style={{ background:"#0d1829", border:"1px solid #1e293b", borderRadius:12,
              padding:"10px 14px", marginBottom:7, display:"flex", gap:10 }}>
              <span style={{ color:"#f87171", fontWeight:700, flexShrink:0 }}>{i+1}.</span>
              <span style={{ color:"#cbd5e1", fontSize:13, lineHeight:1.5 }}>{r}</span>
            </div>
          ))}
        </>
      )}

      {sec==="milestones" && [
        { w:"End of Week 3",  c:"#38bdf8", t:"Consistency established. Shoulder warm-up is habit. Morning mobility daily. Steps 7–9k avg. No binge episodes." },
        { w:"End of Week 6",  c:"#fb923c", t:"Visible tightening in waist. Brain fog reduced. Shoulder improving. Steps 10k+." },
        { w:"End of Week 9",  c:"#a78bfa", t:"Lean, defined shoulders and chest visible. Athletic lower body. Energy high." },
        { w:"Week 10 Deload", c:"#4ade80", t:"Cut volume 40%, keep weight. Protein + steps high. 8+ hrs sleep. Best shape June 3." },
      ].map((m, i) => (
        <div key={i} style={{ background:"#0d1829", border:"1px solid #1e293b",
          borderLeft:`4px solid ${m.c}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ color:m.c, fontWeight:900, marginBottom:5, fontSize:14 }}>{m.w}</div>
          <div style={{ color:"#94a3b8", fontSize:13, lineHeight:1.6 }}>{m.t}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   REUSABLE COMPONENTS
───────────────────────────────────────────── */
function Card({ title, children }) {
  return (
    <div style={{ background:"#0d1829", border:"1px solid #1e293b", borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
      {title && <div style={{ fontWeight:700, color:"#e2e8f0", fontSize:15, marginBottom:12 }}>{title}</div>}
      {children}
    </div>
  );
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{ background:"#0d1829", border:"1px solid #1e293b", borderTop:`3px solid ${color}`,
      borderRadius:12, padding:"14px 12px", textAlign:"center" }}>
      <div style={{ fontSize:28, fontWeight:900, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{unit}</div>
      <div style={{ fontSize:12, color:"#94a3b8", marginTop:4, fontWeight:600 }}>{label}</div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20,
      background: color ? color+"22" : "#1e3a5f33",
      color: color || "#94a3b8",
      border: `1px solid ${color ? color+"44" : "#1e3a5f"}` }}>
      {label}
    </span>
  );
}

function CheckItem({ label, checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)}
      style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"7px 0",
        cursor:"pointer", borderBottom:"1px solid #0f172a" }}>
      <div style={{ width:20, height:20, borderRadius:5,
        border:`2px solid ${checked?"#38bdf8":"#1e3a5f"}`,
        background: checked ? "#38bdf8" : "#0a1525",
        flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", marginTop:1 }}>
        {checked && <span style={{ color:"#0f172a", fontSize:12, fontWeight:900 }}>✓</span>}
      </div>
      <span style={{ color:checked?"#64748b":"#cbd5e1", fontSize:13, lineHeight:1.5,
        textDecoration:checked?"line-through":"none", flex:1 }}>
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #060c16; }
  .fadein { animation: fadeIn .25s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button { -webkit-appearance: none; }
  input[type=number] { -moz-appearance: textfield; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #060c16; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
`;
