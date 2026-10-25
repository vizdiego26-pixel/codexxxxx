import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, ChartNoAxesCombined, Check, CheckCheck, ChevronDown, Clock3, FileText, GraduationCap, Grid2X2, Layers, Lightbulb, Maximize2, Menu, Microscope, Pause, Play, RotateCcw, Search, Shuffle, Sparkles, Target, X, XCircle } from 'lucide-react';
import { gradeAnswer } from './lib/grading.js';
import { loadProgress, saveProgress, recordReview, getCardStatus } from './lib/storage.js';

const SESSION_KEY = 'lamina.session.v1';
const BOOKMARK_KEY = 'lamina.bookmarks.v1';
const DURATION = 120;
const sourceURL = () => window.__LAMINA_SOURCE__ || new URL('source.pdf', document.baseURI).href;
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const pad = n => String(n).padStart(2, '0');
const minutes = seconds => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const mix = array => { const a = [...array]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function initialSession(cards) {
  const old = readLocal(SESSION_KEY, null);
  if (old && Array.isArray(old.queue) && old.queue.length && new Set(old.queue).size === old.queue.length && old.queue.every(id => cards.some(c => c.id === id)) && Number.isInteger(old.index) && old.index >= 0 && old.index <= old.queue.length && typeof old.deadline === 'number' && Number.isFinite(old.deadline)) {
    return { ...old, paused: !!old.paused, remaining: Math.max(0, Math.min(120, Number(old.remaining) || 0)), feedback: old.feedback?.match ? old.feedback : null };
  }
  return { queue: cards.map(c => c.id), index: 0, deadline: Date.now() + DURATION * 1000, paused: false, remaining: DURATION, feedback: null };
}

export default function App() {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const request = window.__LAMINA_CARDS__ ? Promise.resolve(window.__LAMINA_CARDS__) : fetch(new URL('data/cards.json', document.baseURI)).then(r => { if (!r.ok) throw new Error('data'); return r.json(); });
    request.then(data => data.map(card => ({ ...card, image: card.image.startsWith('/') ? new URL(card.image.slice(1), document.baseURI).href : card.image }))).then(setCards).catch(() => setError(true));
  }, []);
  if (!cards) return <div className="loading-screen"><div className="brand-mark"><Layers size={24}/></div><h1>Lámina<span>.</span></h1><p>{error ? 'No pudimos cargar las láminas. Vuelve a cargar la página.' : 'Preparando tu espacio de estudio…'}</p>{error && <button className="primary" onClick={() => location.reload()}>Volver a cargar</button>}</div>;
  return <StudyApp cards={cards}/>;
}

function StudyApp({ cards }) {
  const [view, setView] = useState('study');
  const [progress, setProgress] = useState(loadProgress);
  const [session, setSession] = useState(() => initialSession(cards));
  const [answer, setAnswer] = useState(() => session.feedback?.submitted || '');
  const [tick, setTick] = useState(Date.now());
  const [bookmarks, setBookmarks] = useState(() => { const b = readLocal(BOOKMARK_KEY, []); return Array.isArray(b) ? b.filter(id => cards.some(c => c.id === id)) : []; });
  const [zoom, setZoom] = useState(false);
  const [help, setHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [explanation, setExplanation] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [libraryTab, setLibraryTab] = useState('all');
  const [notice, setNotice] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [offlineReady, setOfflineReady] = useState(!!window.__LAMINA_CARDS__);
  const inputRef = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const card = cards.find(c => c.id === session.queue[session.index]);
  const done = session.index >= session.queue.length;
  const remaining = session.paused || session.feedback ? session.remaining : Math.max(0, Math.ceil((session.deadline - tick) / 1000));
  const feedback = session.feedback;
  const mastered = cards.filter(c => getCardStatus(progress.cards[c.id]) === 'learned').length;
  const due = cards.filter(c => ['due', 'learning'].includes(getCardStatus(progress.cards[c.id]))).length;
  const attempts = Object.values(progress.cards).reduce((n, c) => n + c.attempts, 0);
  const successes = Object.values(progress.cards).reduce((n, c) => n + c.correct, 0);
  const accuracy = attempts ? Math.round(successes / attempts * 100) : 0;
  const percent = Math.round(session.index / session.queue.length * 100);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const markReady = event => { if (event.data?.type === 'LAMINA_OFFLINE_READY') setOfflineReady(true); };
    navigator.serviceWorker.addEventListener('message', markReady);
    navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('message', markReady);
  }, []);
  useEffect(() => { if (!saveProgress(progress)) setStorageWarning(true); }, [progress]);
  useEffect(() => { if (!writeLocal(SESSION_KEY, session)) setStorageWarning(true); }, [session]);
  useEffect(() => { if (!writeLocal(BOOKMARK_KEY, bookmarks)) setStorageWarning(true); }, [bookmarks]);
  useEffect(() => { const interval = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(interval); }, []);
  useEffect(() => { setAnswer(session.feedback?.submitted || ''); setExplanation(false); if (view === 'study') inputRef.current?.focus({ preventScroll: true }); }, [session.index, session.queue, view]);
  useEffect(() => {
    if (card && !feedback && !session.paused && remaining === 0) submitReview('timeout');
  }, [remaining, card?.id, feedback, session.paused]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const close = e => { if (e.key === 'Escape') { setZoom(false); setHelp(false); setMobileNav(false); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);

  function submitReview(reason = 'answer') {
    if (!card || sessionRef.current.feedback || sessionRef.current.paused) return;
    if (reason === 'answer' && !answer.trim()) { inputRef.current?.focus(); return; }
    const result = reason === 'answer' ? gradeAnswer(answer, card) : { correct: false, match: reason, message: reason === 'timeout' ? 'Se acabó el tiempo. Vamos a repasarla.' : 'Aprender también es volver a mirar.' };
    setProgress(p => recordReview(p, card.id, result.correct));
    setSession(s => ({ ...s, feedback: { ...result, submitted: answer }, remaining, paused: false }));
  }
  function next() {
    if (!feedback?.correct) return;
    setSession(s => ({ ...s, index: s.index + 1, deadline: Date.now() + DURATION * 1000, remaining: DURATION, paused: false, feedback: null }));
    setTick(Date.now());
  }
  function retry() {
    setAnswer(''); setExplanation(false);
    setSession(s => ({ ...s, deadline: Date.now() + DURATION * 1000, remaining: DURATION, paused: false, feedback: null }));
    setTick(Date.now()); setTimeout(() => inputRef.current?.focus(), 0);
  }
  function startSession(selection, shuffle = false) {
    if (!selection.length) { setNotice('No hay láminas en esta selección todavía.'); return; }
    const queue = (shuffle ? mix(selection) : selection).map(c => c.id);
    setSession({ queue, index: 0, deadline: Date.now() + DURATION * 1000, paused: false, remaining: DURATION, feedback: null });
    setTick(Date.now()); setView('study'); setMobileNav(false); setAnswer(''); setExplanation(false);
  }
  function pause() {
    if (feedback || done) return;
    setSession(s => s.paused ? { ...s, paused: false, deadline: Date.now() + s.remaining * 1000 } : { ...s, paused: true, remaining });
    setTick(Date.now());
  }
  function navigate(nextView) {
    if (nextView !== 'study' && !session.paused && !feedback && !done) setSession(s => ({ ...s, paused: true, remaining }));
    setView(nextView); setMobileNav(false);
  }
  const toggleBookmark = id => setBookmarks(b => b.includes(id) ? b.filter(x => x !== id) : [...b, id]);
  const openBookmarks = () => { setLibraryTab('saved'); navigate('library'); };
  const categories = [...new Set(cards.map(c => c.category))];
  const filtered = cards.filter(c => (category === 'Todas' || c.category === category) && (libraryTab !== 'saved' || bookmarks.includes(c.id)) && `${c.question} ${c.category} ${c.id} ${c.number}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a href="#" className="brand" onClick={e => { e.preventDefault(); navigate('study'); }}><span className="brand-mark"><Layers size={23}/></span><span>lámina<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">TU ESPACIO DE ESTUDIO</div>
      <nav aria-label="Navegación principal">
        <button className={view === 'study' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('study')}><BookOpen size={19}/><span>Estudiar</span><span className="nav-dot"/></button>
        <button className={view === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => { setLibraryTab('all'); navigate('library'); }}><Grid2X2 size={18}/><span>Mi colección</span><span className="nav-count">70</span></button>
        <button className={view === 'progress' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('progress')}><ChartNoAxesCombined size={19}/><span>Mi progreso</span></button>
        <button className="nav-item" onClick={openBookmarks}><Bookmark size={18}/><span>Guardadas</span>{bookmarks.length > 0 && <span className="nav-count">{bookmarks.length}</span>}</button>
      </nav>
      <div className="sidebar-divider"/>
      <div className="workspace-label collection-label">TU COLECCIÓN</div>
      <button className="course-link" onClick={() => { setCategory('Todas'); setLibraryTab('all'); navigate('library'); }}><span className="course-icon"><Microscope size={19}/></span><span><strong>Morfología I</strong><small>Histología y embriología</small></span></button>
      <div className="sidebar-note"><span className="note-star">✳</span><p>Lo que hoy repasas,<br/><strong>mañana lo recuerdas.</strong></p><div className="note-lines"><i/><i/><i/><i/><i/></div></div>
      <div className="sidebar-bottom"><button onClick={() => setHelp(true)}><Lightbulb size={17}/>Cómo funciona<ArrowUpRight size={14}/></button><div className="profile"><div className="avatar">TÚ</div><div><strong>Tu espacio personal</strong><small>Hecho para aprender</small></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNav(false)}/>}
    <div className="main-wrapper">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu size={21}/></button><GraduationCap size={18}/><span>Mi aprendizaje</span><span className="breadcrumb-slash">/</span><strong>Morfología I</strong></div><div className="topbar-right"><span className="session-pill" title={offlineReady ? "Las 70 láminas están disponibles sin Internet" : "El modo sin conexión se prepara al abrir la versión publicada"}><span/>{offlineReady ? "Disponible sin conexión" : "A tu ritmo"}</span><button className="icon-button help-button" onClick={() => setHelp(true)} aria-label="Ayuda">?</button></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">MENOS MEMORIZAR. MÁS RECORDAR.</div><h1>{view === 'study' ? 'Una lámina a la vez.' : view === 'library' ? 'Tu próxima conexión.' : 'Cada repaso cuenta.'}<span className="heading-spark">✳</span></h1><p>{view === 'study' ? 'Observa con calma, confía en lo que sabes y sigue aprendiendo.' : view === 'library' ? '70 imágenes originales. Un mundo de detalles por descubrir.' : 'Pequeños avances que se convierten en conocimiento.'}</p></div><a className="source-link" href={sourceURL()} target="_blank" rel="noreferrer"><FileText size={16}/>Ver pauta original<ArrowUpRight size={14}/></a></div>
        {storageWarning && <div className="storage-warning" role="alert">Tu navegador no permite guardar el progreso. Puedes estudiar, pero esta sesión no se conservará al cerrar.</div>}
        {view === 'study' && <div className="study-layout">
          <div className="study-column">
            {!done && card ? <section className={`question-card ${feedback ? feedback.correct ? 'is-correct' : 'is-incorrect' : ''}`} aria-label={`Pregunta ${card.number}`}>
              <div className="question-toolbar"><div className="question-number"><span className={feedback ? feedback.correct ? 'question-icon correct' : 'question-icon incorrect' : 'question-icon'}>{feedback ? feedback.correct ? <Check size={15}/> : <X size={15}/> : <Layers size={15}/>}</span>Pregunta {pad(card.number)}<span className="question-total">/ 70</span></div><div className="question-actions"><span className="topic-tag">{card.topic}</span><button className={`icon-button bookmark-button ${bookmarks.includes(card.id) ? 'bookmarked' : ''}`} title={bookmarks.includes(card.id) ? 'Quitar de guardadas' : 'Guardar lámina'} aria-label={bookmarks.includes(card.id) ? 'Quitar de guardadas' : 'Guardar lámina'} aria-pressed={bookmarks.includes(card.id)} onClick={() => toggleBookmark(card.id)}><Bookmark size={18} fill={bookmarks.includes(card.id) ? 'currentColor' : 'none'}/></button></div></div>
              <div className="slide-area"><div className="slide-top-label"><span className="slide-dot"/>{card.category}</div><button className="slide-image-button" onClick={() => setZoom(true)} aria-label="Ampliar imagen de la lámina"><img className="slide-image" src={card.image} alt={`Lámina ${card.number}: imagen original de ${card.category}, con las indicaciones de la pauta`}/></button><button className="expand-button" onClick={() => setZoom(true)}><Maximize2 size={15}/><span>Ampliar imagen</span></button><span className="original-label">IMAGEN ORIGINAL · {card.id}</span></div>
              <div className="answer-section"><div className="question-eyebrow">OBSERVA LA IMAGEN Y RESPONDE</div><h2>{card.question}</h2><form onSubmit={e => { e.preventDefault(); feedback ? feedback.correct ? next() : retry() : submitReview(); }}>
                <label htmlFor="answer">Tu respuesta</label><div className={`input-wrap ${feedback ? feedback.correct ? 'input-correct' : 'input-incorrect' : ''}`}><input id="answer" ref={inputRef} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="¿Qué estructura reconoces?" autoComplete="off" autoCorrect="off" spellCheck="false" disabled={!!feedback || session.paused} aria-describedby={feedback ? 'answer-feedback' : 'answer-hint'}/>{feedback && (feedback.correct ? <Check size={20}/> : <XCircle size={20}/>)}</div>
                {!feedback && <p className="answer-hint" id="answer-hint"><Sparkles size={13}/>Las tildes, los espacios y pequeños errores no cuentan.</p>}
                {feedback && <div id="answer-feedback" className={`feedback ${feedback.correct ? 'feedback-correct' : 'feedback-incorrect'}`} role="status"><div className="feedback-title">{feedback.correct ? <CheckCheck size={18}/> : feedback.match === 'timeout' ? <Clock3 size={18}/> : <RotateCcw size={18}/>}<strong>{feedback.correct ? '¡Bien recordado!' : feedback.match === 'timeout' ? 'El tiempo terminó' : 'Una oportunidad para aprender'}</strong><span className="score-chip">{feedback.correct ? '1 / 1' : '0 / 1'}</span></div><p>{feedback.correct ? feedback.match === 'typo' || feedback.match === 'equivalent' ? 'La redacción cambia, el concepto es correcto.' : 'Esa es la respuesta. Ya puedes seguir.' : 'La respuesta de la pauta es:'}</p>{!feedback.correct && <strong className="official-answer">{card.answer}</strong>}{feedback.correct && <span className="accepted-answer">{card.answer}</span>}{!feedback.correct && <p className="retry-note">Esta lámina sigue aquí. Inténtalo de nuevo para avanzar.</p>}</div>}
                <div className="answer-footer">{!feedback ? <><button className="text-button" type="button" disabled={session.paused} onClick={() => submitReview('reveal')}>Aún no lo sé</button><button className="primary check-button" disabled={!answer.trim() || session.paused} type="submit">Comprobar respuesta<ArrowRight size={17}/></button></> : <><button className="text-button" type="button" onClick={() => setExplanation(!explanation)}><BookOpen size={15}/>{explanation ? 'Ocultar explicación' : 'Entender el porqué'}<ChevronDown size={14} className={explanation ? 'rotate' : ''}/></button><button className="primary" type="submit">{feedback.correct ? 'Siguiente lámina' : 'Intentar de nuevo'}{feedback.correct ? <ArrowRight size={17}/> : <RotateCcw size={16}/>}</button></>}</div>
              </form>{explanation && <Explanation card={card}/>}</div>
              {session.paused && !feedback && <div className="pause-overlay"><span className="pause-circle"><Pause size={30}/></span><h2>Un respiro también ayuda.</h2><p>Tu tiempo y tu pregunta están en pausa.</p><button className="primary" onClick={pause}><Play size={17}/>Continuar estudiando</button></div>}
            </section> : <section className="completion-card"><div className="completion-icon"><GraduationCap size={44}/></div><div className="eyebrow">SESIÓN COMPLETADA</div><h2>Un paso más.<br/>Mucho más aprendido.</h2><p>Completaste las {session.queue.length} láminas de esta sesión.<br/>Tu progreso quedó guardado para el próximo repaso.</p><button className="primary" onClick={() => startSession(cards, true)}><Shuffle size={17}/>Volver a practicar</button><button className="text-button" onClick={() => navigate('progress')}>Ver mi progreso<ArrowRight size={16}/></button></section>}
            <div className="study-caption"><span><span className="live-dot"/>Aprender es un proceso, no una carrera.</span><span>Un concepto. Una conexión. Un avance.</span></div>
          </div>
          <aside className="session-rail">
            <section className={`timer-card ${remaining <= 30 && !feedback ? 'timer-urgent' : ''}`}><div className="rail-card-heading"><Clock3 size={16}/><span>Tu tiempo para pensar</span><span className="two-min-label">2 MIN</span></div><div className="timer-visual"><svg viewBox="0 0 180 180" aria-hidden="true"><circle className="timer-track" cx="90" cy="90" r="77"/><circle className="timer-progress" cx="90" cy="90" r="77" strokeDasharray={484} strokeDashoffset={484 * (1 - (feedback || done ? session.remaining : remaining) / DURATION)}/></svg><div className="timer-digits" role="timer" aria-label={`${Math.floor(remaining / 60)} minutos y ${remaining % 60} segundos restantes`}><span>{minutes(feedback || done ? session.remaining : remaining)}</span><small>{done ? 'sesión completada' : feedback ? 'respuesta registrada' : session.paused ? 'tiempo en pausa' : 'para esta pregunta'}</small></div></div><button className="pause-button" onClick={pause} disabled={!!feedback || done}>{session.paused ? <Play size={14}/> : <Pause size={14}/>} {session.paused ? 'Reanudar sesión' : 'Pausar sesión'}</button><p>Respira. Observa los detalles.<br/>Tú puedes con esta.</p></section>
            <section className="session-progress-card"><div className="rail-card-heading"><Target size={16}/><span>Esta sesión</span><span className="muted">{percent}%</span></div><div className="progress-amount"><strong>{session.index}</strong><span>/ {session.queue.length} láminas</span><span className="progress-spark">✳</span></div><div className="progress-track"><span style={{ width: `${percent}%` }}/></div><div className="progress-label"><span>Un paso a la vez</span><span>{session.queue.length - session.index} por descubrir</span></div><div className="mini-stats"><div><span className="mini-stat-icon green"><CheckCheck size={15}/></span><strong>{mastered}<small>aprendidas</small></strong></div><div><span className="mini-stat-icon gold"><Target size={15}/></span><strong>{attempts ? `${accuracy}%` : '—'}<small>precisión</small></strong></div></div></section>
            <section className="tip-card"><div className="tip-icon"><Lightbulb size={19}/></div><div><h3>Una pista para estudiar</h3><p>Sigue el extremo de la flecha, no solo el tejido que la rodea.</p><span>El detalle hace la diferencia.</span></div></section>
            <button className="rail-link" onClick={() => { setLibraryTab('all'); navigate('library'); }}><Grid2X2 size={15}/>Explorar las 70 láminas<ArrowUpRight size={15}/></button>
          </aside>
        </div>}
        {view === 'library' && <section className="library-view"><div className="library-controls"><div className="library-tabs"><button className={libraryTab === 'all' ? 'selected' : ''} onClick={() => setLibraryTab('all')}>Todas las láminas <span>70</span></button><button className={libraryTab === 'saved' ? 'selected' : ''} onClick={() => setLibraryTab('saved')}>Guardadas <span>{bookmarks.length}</span></button></div><button className="primary" onClick={() => startSession(filtered, true)}><Shuffle size={16}/>Practicar selección</button></div><div className="search-controls"><div className="search-input"><Search size={18}/><input aria-label="Buscar láminas" placeholder="Busca por pregunta, tema o número…" value={search} onChange={e => setSearch(e.target.value)}/></div><select aria-label="Filtrar por tema" value={category} onChange={e => setCategory(e.target.value)}><option value="Todas">Todos los temas</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div><div className="library-grid">{filtered.map(c => { const status = getCardStatus(progress.cards[c.id]); return <article className="library-card" key={c.id}><div className="library-image"><img src={c.image} alt={`Lámina ${c.number} de ${c.category}`} loading="lazy"/><span className="library-number">{pad(c.number)}</span><button className={`icon-button ${bookmarks.includes(c.id) ? 'bookmarked' : ''}`} aria-label={`Guardar lámina ${c.number}`} aria-pressed={bookmarks.includes(c.id)} onClick={() => toggleBookmark(c.id)}><Bookmark size={17} fill={bookmarks.includes(c.id) ? 'currentColor' : 'none'}/></button></div><div className="library-card-body"><span className="question-eyebrow">{c.category}</span><h3>{c.question}</h3><div className="library-card-footer"><span className={`card-status ${status}`}>{status === 'learned' ? 'Aprendida' : status === 'new' ? 'Por descubrir' : 'Para repasar'}</span><button aria-label={`Estudiar lámina ${c.number}`} onClick={() => startSession([c])}>Estudiar<ArrowUpRight size={14}/></button></div></div></article>; })}</div>{!filtered.length && <div className="empty-state"><Bookmark size={35}/><h2>{libraryTab === 'saved' ? 'Tus favoritas vivirán aquí.' : 'No encontramos esa lámina.'}</h2><p>{libraryTab === 'saved' ? 'Toca el marcador de una lámina para guardarla y repasarla después.' : 'Prueba con otro tema o número de pregunta.'}</p></div>}</section>}
        {view === 'progress' && <section className="progress-view"><div className="metric-grid"><Metric icon={<Layers/>} value={`${mastered} / 70`} label="Láminas aprendidas"/><Metric icon={<Target/>} value={attempts ? `${accuracy}%` : '—'} label="Precisión en tus respuestas"/><Metric icon={<RotateCcw/>} value={due} label="Pendientes de repasar"/><Metric icon={<CheckCheck/>} value={attempts} label="Respuestas practicadas"/></div><div className="progress-content"><div className="topic-progress"><h2>Tu mapa de aprendizaje</h2><p>Cada tema, una nueva conexión.</p>{categories.map(c => { const all = cards.filter(card => card.category === c); const count = all.filter(card => getCardStatus(progress.cards[card.id]) === 'learned').length; return <div className="topic-row" key={c}><div><span>{c}</span><strong>{count} / {all.length}</strong></div><div className="progress-track"><span style={{ width: `${count / all.length * 100}%` }}/></div></div>; })}</div><div className="review-panel"><span className="review-symbol">✳</span><h2>Recordar necesita<br/>un segundo encuentro.</h2><p>Las respuestas correctas vuelven en 1, 3, 7, 14 y 30 días. Las que cuestan un poco más se quedan para practicar.</p><button className="primary" onClick={() => startSession(cards.filter(c => ['due', 'learning'].includes(getCardStatus(progress.cards[c.id]))), true)} disabled={!due}><RotateCcw size={16}/>Repasar pendientes{due > 0 && ` (${due})`}</button><button className="text-button" onClick={() => startSession(cards, true)}><Shuffle size={15}/>Practicar todas</button><p className="local-note">Tu progreso se guarda en este navegador. No necesitas una cuenta.</p></div></div></section>}
        <footer className="page-footer"><span><Layers size={13}/>lámina · Aprender para recordar.</span><span>Morfología I <span className="footer-dot">·</span> 70 láminas de tu pauta</span></footer>
      </main>
    </div>
    {notice && <div role="status" className="toast"><Lightbulb size={18}/>{notice}<button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {zoom && card && <Modal title={`Lámina ${pad(card.number)} · ${card.category}`} onClose={() => setZoom(false)} wide><img className="zoom-image" src={card.image} alt={`Imagen ampliada de lámina ${card.number}`}/><p className="zoom-caption">{card.question}</p></Modal>}
    {help && <Modal title="Tu siguiente conexión empieza aquí" onClose={() => setHelp(false)}><div className="help-intro"><span className="brand-mark"><Layers size={24}/></span><p>Una forma más simple de estudiar tu pauta de Morfología I.</p></div><ol className="help-steps"><li><span>01</span><div><h3>Observa sin apuro</h3><p>Tienes 2 minutos por intento. Amplía la imagen si necesitas ver un detalle. Al pausar, se oculta la pregunta.</p></div></li><li><span>02</span><div><h3>Escribe lo que reconoces</h3><p>Se aceptan tildes omitidas, espacios, variantes equivalentes y pequeños errores de escritura. Los conceptos distintos siguen siendo incorrectos.</p></div></li><li><span>03</span><div><h3>Corrige, conecta y avanza</h3><p>Si fallas o se acaba el tiempo, verás la respuesta oficial y repetirás la misma lámina. Solo podrás avanzar al acertar.</p></div></li></ol><div className="help-note"><BookOpen size={19}/><p>El banco usa las 70 láminas del solucionario. El PDF de controles de 2024 se usó como referencia visual de la interfaz.</p></div><button className="primary full-width" onClick={() => setHelp(false)}>Vamos a aprender<ArrowRight size={17}/></button></Modal>}
  </div>;
}

function Metric({ icon, value, label }) { return <div className="metric-card"><span>{icon}</span><strong>{value}</strong><p>{label}</p></div>; }
function Explanation({ card }) { const fields = [['reading', 'Dónde mirar'], ['rationale', 'Por qué es esta respuesta'], ['definition', 'Qué es'], ['function', 'Qué función cumple'], ['distinction', 'Cómo distinguirlo'], ['development', 'Relación con el desarrollo']]; return <div className="explanation"><h3>Conecta la imagen con el concepto.</h3>{fields.map(([key, title]) => card.explanation[key] && <section key={key}><h4>{title}</h4><p>{card.explanation[key]}</p></section>)}<a href={`${sourceURL()}#page=${card.sourcePage}`} target="_blank" rel="noreferrer">Consultar esta lámina en la pauta<ArrowUpRight size={14}/></a></div>; }
function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => { const before = document.activeElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; ref.current?.focus(); return () => { document.body.style.overflow = overflow; before?.focus?.(); }; }, []);
  function trap(e) { if (e.key !== 'Tab') return; const elements = ref.current.querySelectorAll('button, a, input, select, [tabindex="0"]'); const first = elements[0], last = elements[elements.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal ${wide ? 'wide-modal' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={trap}><header><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={21}/></button></header>{children}</section></div>;
}
