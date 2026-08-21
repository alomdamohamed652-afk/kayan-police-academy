import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './academy-final.css';

const LOGO = '/police-logo.png';
const RULES_URL = 'https://docs.google.com/document/d/1uxEl8AjcDVyMko8g9Ga_9Fwiw8Uh9OzKApWTIxt0ghk/edit?tab=t.0';

async function api(url, options) {
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

function App() {
  const [page, setPage] = useState('home');
  const [menu, setMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [hierarchy, setHierarchy] = useState([]);

  useEffect(() => {
    api('/api/me').then(setUser).catch(() => setUser({ authenticated: false }));
    api('/api/public/hierarchy').then((data) => setHierarchy(data.hierarchy || [])).catch(() => {});
  }, []);

  const isAdmin = Boolean(user?.permissions?.isAdmin);
  const isOfficer = Boolean(user?.permissions?.isOfficer);
  const name = user?.police?.name || user?.discord?.global_name || 'المستخدم';
  const rank = user?.police?.rank || 'مواطن';
  const responsibility = user?.police?.responsibility || '';

  const navigate = (next) => {
    setPage(next);
    setMenu(false);
  };

  const nav = [
    ['home', 'الرئيسية'],
    ['hierarchy', 'هيكل الأكاديمية'],
    ['applications', 'التقديمات'],
    ['rules', 'القوانين'],
  ];
  if (isOfficer) nav.push(['exams', 'الاختبارات'], ['members', 'الأفراد'], ['evaluations', 'التقييمات']);
  if (isAdmin) nav.push(['admin', 'مركز الإدارة']);

  return (
    <div className="app">
      <aside className={menu ? 'open' : ''}>
        <div className="brand">
          <div className="logoFrame"><img src={LOGO} alt="شعار أكاديمية شرطة كيان" /></div>
          <div><b>أكاديمية شرطة كيان</b><small>KAYAN POLICE ACADEMY</small></div>
        </div>
        <nav>
          {nav.map(([id, label]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
              <span>{label}</span><span>‹</span>
            </button>
          ))}
        </nav>
        <div className="sideBottom">◈ البوابة الرسمية</div>
      </aside>

      <main>
        <header>
          <button className="menu" onClick={() => setMenu(!menu)}>{menu ? '×' : '☰'}</button>
          <div className="crumb">أكاديمية شرطة كيان / {nav.find((item) => item[0] === page)?.[1]}</div>
          {user?.authenticated ? (
            <div className="userHeader">
              <b>{name}</b><span>{rank}</span>{responsibility && <span>{responsibility}</span>}
              {isAdmin && <em>ADMIN</em>}
              <button onClick={async () => { await api('/api/logout', { method: 'POST' }); location.reload(); }}>خروج</button>
            </div>
          ) : (
            <button className="discord" onClick={() => { location.href = '/auth/discord'; }}>تسجيل الدخول عبر Discord</button>
          )}
        </header>

        {page === 'home' && <Home user={user} navigate={navigate} />}
        {page === 'hierarchy' && <Hierarchy data={hierarchy} />}
        {page === 'rules' && <Rules />}
        {page === 'applications' && <Applications user={user} />}
        {page === 'exams' && <Simple title="الاختبارات" text="الاختبارات المنشورة ستظهر هنا." />}
        {page === 'members' && <Members />}
        {page === 'evaluations' && <Simple title="التقييمات" text="سجل التقييمات الأكاديمية." />}
        {page === 'admin' && <Admin />}
      </main>
      <Siren />
    </div>
  );
}

function Home({ user, navigate }) {
  return (
    <>
      <section className="hero">
        <div className="heroText">
          <small>OFFICIAL ACADEMY PORTAL</small>
          <h1>أكاديمية<br /><strong>شرطة كيان</strong></h1>
          <p>البوابة الرسمية للتقديم والقبول والتأهيل والاختبارات والسجل الأكاديمي.</p>
          <div className="actions">
            {!user?.authenticated && <button className="gold" onClick={() => { location.href = '/auth/discord'; }}>تسجيل الدخول</button>}
            {user?.authenticated && !user?.permissions?.isOfficer && <button className="gold" onClick={() => navigate('applications')}>التقديم للشرطة</button>}
            <button className="ghost" onClick={() => navigate('hierarchy')}>هيكل الأكاديمية</button>
            <a className="ghost" href={RULES_URL} target="_blank" rel="noreferrer">قوانين الشرطة ↗</a>
          </div>
        </div>
        <div className="heroCrest">
          <img src={LOGO} alt="شعار الشرطة" />
          <b>KAYAN POLICE ACADEMY</b>
          <span>DISCIPLINE · HONOR · DUTY</span>
        </div>
      </section>
      <section className="homeCards">
        <Info title="بوابة رسمية" text="دخول موحد وآمن عبر Discord." />
        <Info title="التقديمات" text="دفعات مستقلة وحالات قبول واضحة." />
        <Info title="الاختبارات" text="اختبارات حسب المرحلة التدريبية." />
        <Info title="قوانين الشرطة" text="اللائحة الرسمية متاحة مباشرة." />
      </section>
    </>
  );
}

function Info({ title, text }) {
  return <div className="info"><div><b>{title}</b><span>{text}</span></div></div>;
}

function Siren() {
  const [mode, setMode] = useState(0);
  return <button className={`siren siren-${mode}`} onClick={() => setMode((mode + 1) % 3)} aria-label="تغيير نمط السيرينة"><i /><i /><i /></button>;
}

function Page({ title, sub, children }) {
  return <><section className="pageTitle"><span>KAYAN POLICE ACADEMY</span><h1>{title}</h1><p>{sub}</p></section>{children}</>;
}

function Rules() {
  return <Page title="قوانين الشرطة" sub="اللائحة الرسمية لشرطة كيان."><div className="center panel"><h2>قوانين الشرطة</h2><p>افتح اللائحة الرسمية في مستند Google Docs.</p><a className="gold" href={RULES_URL} target="_blank" rel="noreferrer">فتح القوانين ↗</a></div></Page>;
}

function Hierarchy({ data }) {
  return <Page title="هيكل الأكاديمية" sub="المناصب والأشخاص الذين تعتمدهم الإدارة."><div className="hierarchyGrid">{data.map((item) => <div className="hierCard" key={item.id}>{item.image ? <img src={item.image} alt="" /> : <div className="placeholder">◈</div>}<small>{item.title}</small><b>{item.name}</b></div>)}</div></Page>;
}

function Applications({ user }) {
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);

  useEffect(() => { api('/api/public/academy').then(setData).catch(() => setData({})); }, []);
  if (!user?.authenticated) return <Simple title="التقديمات" text="سجّل الدخول عبر Discord للمتابعة." />;
  if (user.permissions?.isOfficer) return <Simple title="التقديمات" text="التقديم الإلكتروني مخصص للمواطنين." />;
  if (!data) return <Simple title="التقديمات" text="جاري التحميل..." />;
  if (!data.application?.enabled || !data.batch) return <Simple title="التقديمات" text="التقديمات مغلقة حاليًا." />;
  if (done) return <Simple title="تم استلام طلبك" text={`تم تسجيل طلبك ضمن دفعة «${data.batch.name}».`} />;

  const questions = data.application.questions || [];
  const setAnswer = (id, value) => setAnswers((current) => ({ ...current, [id]: value }));
  const submit = async () => {
    if (questions.some((q) => q.required && !String(answers[q.id] || '').trim())) return alert('أكمل الأسئلة المطلوبة');
    await api('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
    setDone(true);
  };

  return <><Page title={data.batch.name} sub={data.application.description || 'نموذج التقديم الرسمي.'} /><div className="form panel">{questions.map((q, index) => <Question key={q.id} q={q} index={index} value={answers[q.id]} onChange={(value) => setAnswer(q.id, value)} />)}<button className="gold" onClick={submit}>إرسال التقديم</button></div></>;
}

function Question({ q, index, value, onChange }) {
  return <div className="question"><b>{index + 1}. {q.text}</b>{q.type === 'choice' && <div className="options">{(q.options || []).map((option) => <label key={option}><input type="radio" name={q.id} checked={value === option} onChange={() => onChange(option)} />{option}</label>)}</div>}{q.type === 'yesno' && <div className="options"><label><input type="radio" name={q.id} checked={value === 'نعم'} onChange={() => onChange('نعم')} />نعم</label><label><input type="radio" name={q.id} checked={value === 'لا'} onChange={() => onChange('لا')} />لا</label></div>}{q.type === 'text' && <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function Members() {
  const [members, setMembers] = useState([]);
  useEffect(() => { api('/api/academy/members').then((data) => setMembers(data.members || [])).catch(() => {}); }, []);
  return <Page title="الأفراد" sub="بيانات الشرطة من السجل المعتمد."><div className="panel table">{members.map((member) => <div className="member" key={member.discordId}><div className="avatar">{member.name?.[0] || '؟'}</div><div><b>{member.name}</b><small>{member.rank || 'بدون رتبة'}{member.responsibility ? ` · ${member.responsibility}` : ''}</small></div></div>)}</div></Page>;
}

function Simple({ title, text }) {
  return <Page title={title} sub={text}><div className="center panel"><h2>{text}</h2></div></Page>;
}

function Admin() {
  const [state, setState] = useState(null);
  const [batch, setBatch] = useState('');
  const [tab, setTab] = useState('overview');
  const load = () => api('/api/admin/academy-state').then(setState).catch(() => setState({ batches: [], applications: [] }));
  useEffect(load, []);
  if (!state) return <Simple title="مركز الإدارة" text="جاري التحميل..." />;
  const active = (state.batches || []).find((item) => item.status === 'open');
  const createBatch = async () => {
    if (!batch.trim()) return;
    await api('/api/admin/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: batch.trim() }) });
    setBatch('');
    load();
  };
  const closeBatch = async () => {
    if (!active) return;
    await api(`/api/admin/batches/${active.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
    load();
  };
  return <><section className="adminHero"><div><small>ACADEMY CONTROL CENTER</small><h1>مركز التحكم</h1><p>إدارة التقديمات والدفعات.</p></div><Settings /></section><div className="tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>نظرة عامة</button><button className={tab === 'applications' ? 'active' : ''} onClick={() => setTab('applications')}>التقديمات والدفعات</button></div>{tab === 'overview' && <div className="dashboard"><Card n={(state.batches || []).length} t="دفعات" /><Card n={(state.applications || []).length} t="طلبات" /><Card n={(state.applications || []).filter((x) => x.status === 'accepted').length} t="مقبولين" /><Card n={active ? 'مفتوحة' : 'مغلقة'} t="التقديمات" /></div>}{tab === 'applications' && <div className="adminSection"><div className="toolbar"><input value={batch} onChange={(event) => setBatch(event.target.value)} placeholder="اسم الدفعة الجديدة" /><button className="gold" onClick={createBatch}>إنشاء دفعة</button>{active && <button className="danger" onClick={closeBatch}>غلق الدفعة</button>}</div><div className="panel table">{(state.applications || []).map((application) => <div className="applicationRow" key={application.id}><div><b>{application.name || application.discordId}</b><small>{application.batchName || application.batchId}</small></div><span className={`status ${application.status}`}>{application.status}</span></div>)}</div></div>}</>;
}

function Card({ n, t }) {
  return <div className="dashCard"><b>{n}</b><span>{t}</span></div>;
}

createRoot(document.getElementById('root')).render(<App />);
