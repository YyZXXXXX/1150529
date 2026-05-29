import { useState, useRef, useMemo, useEffect } from 'react'
import './App.css'

// 預設的柔和質感調色盤，為不同分類自動套用
const COLOR_PALETTE = [
  { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' }, // 水藍
  { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' }, // 柔綠
  { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' }, // 櫻桃紅
  { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' }, // 淡紫
  { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' }, // 暖橘
  { bg: '#fef08a', text: '#854d0e', border: '#fde047' }  // 銘黃
];

function App() {
  const [events, setEvents] = useState([])
  const [categories, setCategories] = useState(['工作', '個人', '重要'])
  const [newEvent, setNewEvent] = useState({ title: '', start: '', end: '', category: '工作' })
  const [newCategory, setNewCategory] = useState('')
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('gasUrl') || '')
  const [isAutoSync, setIsAutoSync] = useState(() => localStorage.getItem('isAutoSync') === 'true')
  const [currentDate, setCurrentDate] = useState(new Date()) // 當前顯示的月份
  const [selectedCategory, setSelectedCategory] = useState(null)
  const isRemoteUpdate = useRef(false)
  const initialMount = useRef(true)
  const fileInputRef = useRef(null)

  const formatToICS = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  const parseICSDate = (icsDate) => {
    if (!icsDate) return "";
    // 支援有時間 (YYYYMMDDTHHMMSS) 以及全天 (YYYYMMDD) 格式
    const m = icsDate.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
    if (m) {
      if (m[4]) {
        if (m[7] === 'Z') {
          const d = new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]));
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
      }
      return `${m[1]}-${m[2]}-${m[3]}T00:00`; // 全天行程補上預設時間
    }
    return icsDate;
  }

  const handleAddEvent = (e) => {
    e.preventDefault();
    if (!newEvent.title) return;
    setEvents([...events, { ...newEvent, id: crypto.randomUUID() }]);
    setNewEvent({ title: '', start: '', end: '', category: categories[0] });
  }

  const handleAddCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      setCategories([...categories, newCategory]);
      setNewCategory('');
    }
  }

  const exportICS = () => {
    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//My Calendar App//EN\r\n";
    events.forEach(ev => {
      icsContent += "BEGIN:VEVENT\r\n";
      if (ev.id) icsContent += `UID:${ev.id}\r\n`;
      icsContent += `DTSTAMP:${formatToICS(new Date())}\r\n`;
      if (ev.start) icsContent += `DTSTART:${formatToICS(ev.start)}\r\n`;
      if (ev.end) icsContent += `DTEND:${formatToICS(ev.end)}\r\n`;
      if (ev.title) icsContent += `SUMMARY:${ev.title}\r\n`;
      if (ev.category) icsContent += `CATEGORIES:${ev.category}\r\n`;
      icsContent += "END:VEVENT\r\n";
    });
    icsContent += "END:VCALENDAR\r\n";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calendar.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleImportICS = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split(/\r?\n/);
      const importedEvents = [];
      let currentEvent = null;
      let currentCategories = new Set(categories);

      // 處理 ICS 可能會折行 (Line Folding) 的問題
      const unfoldedLines = [];
      for (let line of lines) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          if (unfoldedLines.length > 0) unfoldedLines[unfoldedLines.length - 1] += line.substring(1);
        } else {
          unfoldedLines.push(line);
        }
      }

      for (let line of unfoldedLines) {
        if (line.startsWith('BEGIN:VEVENT')) {
          currentEvent = { id: crypto.randomUUID() };
        } else if (line.startsWith('END:VEVENT')) {
          if (currentEvent && currentEvent.title && currentEvent.start) {
            if (!currentEvent.category) currentEvent.category = categories[0];
            importedEvents.push(currentEvent);
          }
          currentEvent = null;
        } else if (currentEvent) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const keyPart = line.substring(0, colonIdx);
          const valuePart = line.substring(colonIdx + 1);

          if (keyPart.startsWith('SUMMARY')) currentEvent.title = valuePart;
          else if (keyPart.startsWith('DTSTART')) currentEvent.start = parseICSDate(valuePart);
          else if (keyPart.startsWith('DTEND')) currentEvent.end = parseICSDate(valuePart);
          else if (keyPart.startsWith('CATEGORIES')) {
            const cat = valuePart.split(',')[0]; // 支援多重分類時取第一個
            currentEvent.category = cat;
            currentCategories.add(cat);
          }
          else if (keyPart.startsWith('UID')) currentEvent.id = valuePart;
        }
      }
      setCategories(Array.from(currentCategories));
      setEvents(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...importedEvents.filter(ev => !existingIds.has(ev.id))];
      });
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const syncToSheets = async (eventsToSync = events, silent = false) => {
    if (!gasUrl) {
      if (!silent) alert("請輸入 Google Apps Script 網址");
      return;
    }
    try {
      await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify(eventsToSync),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' } // 避免發生 CORS 預檢錯誤
      });
      if (!silent) alert("成功儲存至 Google Sheets！");
    } catch (err) {
      console.error(err);
      if (!silent) alert("儲存失敗");
    }
  };

  const loadFromSheets = async (silent = false) => {
    if (!gasUrl) {
      if (!silent) alert("請輸入 Google Apps Script 網址");
      return;
    }
    try {
      const response = await fetch(gasUrl);
      const data = await response.json();
      isRemoteUpdate.current = true; // 標記為遠端更新，避免觸發自動上傳
      setEvents(data);
      const sheetsCategories = data.map(ev => ev.category).filter(Boolean);
      setCategories(prev => Array.from(new Set([...prev, ...sheetsCategories])));
      if (!silent) alert("載入成功！");
    } catch (err) {
      console.error(err);
      if (!silent) alert("載入失敗");
    }
  };

  // 儲存設定至 localStorage，免去每次重整都要重新輸入網址
  useEffect(() => {
    localStorage.setItem('gasUrl', gasUrl);
    localStorage.setItem('isAutoSync', isAutoSync);
  }, [gasUrl, isAutoSync]);

  // 監聽本地變動，若有變動且開啟自動同步，則自動背景上傳
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return; // 若變更來自於遠端拉取，則不上傳
    }
    if (isAutoSync && gasUrl) {
      syncToSheets(events, true); // silent = true 不會跳出煩人的彈出視窗
    }
  }, [events]);

  // 若開啟自動同步，則每 15 秒自動從遠端拉取最新資料
  useEffect(() => {
    let interval;
    if (isAutoSync && gasUrl) {
      loadFromSheets(true); // 開啟時先拉取一次
      interval = setInterval(() => {
        loadFromSheets(true);
      }, 15000);
    }
    return () => clearInterval(interval);
  }, [isAutoSync, gasUrl]);

  // 月曆邏輯：計算當前月份的每一天
  const { daysInMonth, firstDayOfMonth, year, month } = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const firstDay = new Date(y, m, 1).getDay(); // 0(週日) ~ 6(週六)
    return { daysInMonth: days, firstDayOfMonth: firstDay, year: y, month: m };
  }, [currentDate]);

  // 月曆邏輯：建立日期的陣列 (包含補齊的空白天數)
  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [daysInMonth, firstDayOfMonth]);

  // 月曆邏輯：判斷該天是否有事件（支援跨日行程）
  const getEventsForDay = (day) => {
    if (!day) return [];
    const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(ev => {
      if (!ev.start) return false;
      const startStr = ev.start.substring(0, 10);
      const endStr = ev.end ? ev.end.substring(0, 10) : startStr;
      return currentDayStr >= startStr && currentDayStr <= endStr;
    });
  };

  // 依照分類取得顏色
  const getCategoryColor = (categoryName) => {
    const idx = categories.indexOf(categoryName);
    return COLOR_PALETTE[idx % COLOR_PALETTE.length] || COLOR_PALETTE[0];
  };

  // UI 元件樣式 (簡約現代風)
  const cardStyle = { backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px', border: '1px solid #e5e7eb', flexShrink: 0 };
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', transition: 'border 0.2s', backgroundColor: '#f9fafb', marginBottom: '12px', boxSizing: 'border-box', fontSize: '0.9rem' };
  const btnStyle = { padding: '8px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s', marginRight: '8px', fontSize: '0.9rem' };
  const btnOutlineStyle = { ...btnStyle, backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', boxSizing: 'border-box', textAlign: 'left', padding: '20px' }}>
          
      {/* 視窗化主容器 (解決滿版導致行事曆太巨大的問題) */}
      <div style={{ display: 'flex', width: '100%', maxWidth: '1300px', height: '100%', maxHeight: '850px', backgroundColor: '#fff', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', overflow: 'hidden', border: '1px solid #d1d5db' }}>
            
        {/* 左側：控制面板 */}
        <div style={{ flex: '0 0 300px', height: '100%', overflowY: 'auto', padding: '24px 20px', boxSizing: 'border-box', backgroundColor: '#f9fafb', borderRight: '1px solid #e5e7eb' }}>
          
          <h1 style={{ color: '#111827', marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '1.2em' }}>📅</span> <span>現代行事曆</span>
          </h1>
        
        {/* 新增行程卡片 */}
        <div style={cardStyle}>
              <h3 style={{ marginTop: 0, color: '#374151', fontSize: '1.1rem' }}>✨ 新增行程</h3>
              <form onSubmit={handleAddEvent}>
                <input type="text" placeholder="行程標題" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} required style={inputStyle} />
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>開始時間</label>
                <input type="datetime-local" value={newEvent.start} onChange={e => setNewEvent({...newEvent, start: e.target.value})} style={inputStyle} required />
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>結束時間</label>
                <input type="datetime-local" value={newEvent.end} onChange={e => setNewEvent({...newEvent, end: e.target.value})} style={inputStyle} />
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>選擇分類</label>
                <select value={newEvent.category} onChange={e => setNewEvent({...newEvent, category: e.target.value})} style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="submit" style={{ ...btnStyle, width: '100%', marginTop: '10px' }}>加入行事曆</button>
              </form>
            </div>

            {/* 雲端與檔案管理卡片 */}
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, color: '#374151', fontSize: '1.1rem' }}>☁️ 資料同步與備份</h3>
              <input 
                type="text" 
                value={gasUrl} 
                onChange={e => setGasUrl(e.target.value)} 
                placeholder="Google Apps Script 網址"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={syncToSheets} style={{ ...btnOutlineStyle, flex: 1, padding: '8px' }}>上傳</button>
                <button onClick={loadFromSheets} style={{ ...btnOutlineStyle, flex: 1, padding: '8px' }}>下載</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '8px' }}>
                <input type="checkbox" id="autoSync" checked={isAutoSync} onChange={e => setIsAutoSync(e.target.checked)} />
                <label htmlFor="autoSync" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>啟用雙向即時同步 (自動上傳與拉取)</label>
              </div>
              
              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => fileInputRef.current.click()} style={{ ...btnOutlineStyle, flex: 1, padding: '8px' }}>匯入 ICS</button>
                <input type="file" accept=".ics" ref={fileInputRef} onChange={handleImportICS} style={{ display: 'none' }} />
                <button onClick={exportICS} style={{ ...btnOutlineStyle, flex: 1, padding: '8px' }}>匯出 ICS</button>
              </div>
            </div>

            {/* 分類管理卡片 */}
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, color: '#374151', fontSize: '1.1rem' }}>🏷️ 分類設定</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  value={newCategory} 
                  onChange={e => setNewCategory(e.target.value)} 
                  placeholder="新分類" 
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
                <button onClick={handleAddCategory} style={{ ...btnStyle, margin: 0, whiteSpace: 'nowrap' }}>新增</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {categories.map((cat, idx) => {
                  const color = getCategoryColor(cat);
                  const isSelected = selectedCategory === cat;
                  return (
                    <span 
                      key={cat} 
                      onClick={() => setSelectedCategory(prev => prev === cat ? null : cat)}
                      style={{ 
                        backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}`, 
                        padding: '4px 8px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '500',
                        cursor: 'pointer', opacity: selectedCategory && !isSelected ? 0.4 : 1,
                        transition: 'opacity 0.2s', userSelect: 'none'
                      }}
                    >
                      {cat}
                    </span>
                  );
                })}
              </div>
              {selectedCategory && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#374151' }}>「{selectedCategory}」的行程：</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {events.filter(ev => ev.category === selectedCategory).map(ev => (
                      <li key={ev.id} style={{ flexShrink: 0, fontSize: '0.85rem', padding: '6px 8px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
                        <div style={{ fontWeight: '600', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                        {ev.start && <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{ev.start.replace('T', ' ')}</div>}
                      </li>
                    ))}
                    {events.filter(ev => ev.category === selectedCategory).length === 0 && <li style={{ fontSize: '0.85rem', color: '#9ca3af' }}>目前沒有這個分類的行程</li>}
                  </ul>
                </div>
              )}
            </div>

        </div>

        {/* 右側：月曆主體 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', boxSizing: 'border-box', backgroundColor: '#fff', minWidth: 0, overflow: 'hidden' }}>
              
        {/* 月曆標題控制區 */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={btnOutlineStyle}>← 上個月</button>
          <h2 style={{ margin: 0, color: '#1f2937', fontSize: '1.5rem', fontWeight: '700' }}>
            {year} 年 {month + 1} 月
          </h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={btnOutlineStyle}>下個月 →</button>
        </div>

        {/* 月曆方格 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden', minHeight: 0 }}>
                
          {/* 星期標題 */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
              <div key={d} style={{ padding: '12px 0', textAlign: 'center', fontWeight: '600', color: i === 0 || i === 6 ? '#9ca3af' : '#4b5563', fontSize: '0.9rem' }}>
                {d}
              </div>
            ))}
          </div>

          {/* 日期網格 */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: `repeat(${calendarDays.length / 7}, minmax(0, 1fr))`, backgroundColor: '#fff', minHeight: 0 }}>
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
              
              return (
                <div key={idx} style={{ backgroundColor: day ? '#fff' : '#f9fafb', padding: '8px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                  
                  {/* 日期數字 */}
                  {day && (
                    <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                      <span style={{ 
                        display: 'inline-block', width: '28px', height: '28px', lineHeight: '28px', textAlign: 'center', borderRadius: '50%',
                        backgroundColor: isToday ? '#3b82f6' : 'transparent', 
                        color: isToday ? '#fff' : '#4b5563',
                        fontWeight: isToday ? 'bold' : 'normal',
                        fontSize: '0.95rem'
                      }}>
                        {day}
                      </span>
                    </div>
                  )}

                  {/* 行程標籤 */}
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
                    {dayEvents.map(ev => {
                      const color = getCategoryColor(ev.category);
                      return (
                        <div 
                          key={ev.id} 
                          title={`${ev.title}\n開始: ${ev.start?.replace('T', ' ')}\n結束: ${ev.end?.replace('T', ' ')}`}
                          onClick={() => { if(window.confirm(`確定要刪除行程「${ev.title}」嗎？`)) setEvents(events.filter(e => e.id !== ev.id)) }}
                          style={{ flexShrink: 0, backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}`, padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                        >
                          {ev.title}
                        </div>
                      )
                    })}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
        
        </div>
      </div>
    </div>
  )
}

export default App
