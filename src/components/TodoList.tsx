import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Circle, 
  Trash2, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Briefcase, 
  FileText
} from 'lucide-react';
import { dbService } from '../services/db';
import type { TodoItem, Lead } from '../services/db';
import { playSound } from '../services/sound';

const TodoList: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form State
  const [text, setText] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [period, setPeriod] = useState<'day' | 'week' | 'later'>('day');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [leadId, setLeadId] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Filter State
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'day' | 'week' | 'later'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'completed' | 'all'>('pending');
  const [filterLeadLinked, setFilterLeadLinked] = useState<boolean>(false);

  // Expand states for notes
  const [expandedNotes, setExpandedNotes] = useState<{ [id: string]: boolean }>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await dbService.getTodos();
      setTodos(list);

      const allLeads = await dbService.getAllLeads();
      const activeLeads = allLeads.filter(l => l.status !== 'never_visit' && l.status !== 'no_value');
      setLeads(activeLeads);
    } catch (e) {
      console.error('Failed to load todos', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    // Find linked lead name if applicable
    let leadName = undefined;
    if (leadId) {
      const matched = leads.find(l => l.id === leadId);
      if (matched) leadName = matched.name;
    }

    const newTodo: TodoItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      text: text.trim(),
      notes: notes.trim() || undefined,
      dueDate: dueDate || undefined,
      period,
      priority,
      completed: false,
      leadId: leadId || undefined,
      leadName,
      createdAt: Date.now()
    };

    await dbService.saveTodo(newTodo);
    playSound('click');

    // Reset Form
    setText('');
    setNotes('');
    setDueDate('');
    setLeadId('');
    setPeriod('day');
    setPriority('medium');
    setShowAdvanced(false);

    // Reload list
    loadData();
  };

  const handleToggleComplete = async (todo: TodoItem) => {
    const updated = {
      ...todo,
      completed: !todo.completed
    };
    await dbService.saveTodo(updated);
    playSound('click');
    loadData();
  };

  const handleDeleteTodo = async (id: string) => {
    if (window.confirm('Delete this task?')) {
      await dbService.deleteTodo(id);
      playSound('click');
      loadData();
    }
  };

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Filter logic
  const filteredTodos = todos.filter(todo => {
    if (filterPeriod !== 'all' && todo.period !== filterPeriod) return false;
    if (filterPriority !== 'all' && todo.priority !== filterPriority) return false;
    if (filterLeadLinked && !todo.leadId) return false;
    
    if (filterStatus === 'pending' && todo.completed) return false;
    if (filterStatus === 'completed' && !todo.completed) return false;
    
    return true;
  });

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
        <Calendar style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
        <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1rem' }}>
          Sales Action Planner
        </span>
        <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
          {todos.filter(t => !t.completed).length} Pending Tasks
        </span>
      </div>

      {/* Quick Add Form */}
      <form onSubmit={handleAddTodo} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            placeholder="Add new task (e.g. Call Bob tomorrow, Drop off flyers...)"
            required
            className="form-control"
            style={{ flex: 1 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn-primary" style={{ padding: '0 0.85rem' }}>
            <Plus style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Collapsible Advanced Settings */}
        <div style={{ alignSelf: 'flex-start' }}>
          <button 
            type="button" 
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'hsl(var(--text-muted))',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              cursor: 'pointer',
              padding: '0.2rem 0'
            }}
          >
            {showAdvanced ? <ChevronUp style={{ width: '14px', height: '14px' }} /> : <ChevronDown style={{ width: '14px', height: '14px' }} />}
            <span>{showAdvanced ? 'Hide Options' : 'More Options (Priority, Period, Lead Link)'}</span>
          </button>
        </div>

        {showAdvanced && (
          <div style={{ 
            background: 'hsla(var(--bg-secondary) / 0.5)', 
            padding: '1rem', 
            borderRadius: '8px', 
            border: '1px solid hsl(var(--border-muted))',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            animation: 'scaleUp 0.2s ease-out'
          }}>
            {/* Period */}
            <div className="form-group">
              <label>Target Period</label>
              <select className="form-control" value={period} onChange={(e) => setPeriod(e.target.value as any)}>
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="later">Later</option>
              </select>
            </div>

            {/* Priority */}
            <div className="form-group">
              <label>Priority Level</label>
              <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="low">Low (Sage)</option>
                <option value="medium">Medium (Amber)</option>
                <option value="high">High (Red)</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="form-group">
              <label>Due Date (Optional)</label>
              <input 
                type="date" 
                className="form-control"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Link Pipeline Lead */}
            <div className="form-group">
              <label>Link to Lead (Optional)</label>
              <select className="form-control" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">-- Don't Link Lead --</option>
                {leads.map(lead => (
                  <option key={lead.id} value={lead.id}>{lead.name}</option>
                ))}
              </select>
            </div>

            {/* Task Description Notes */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Detailed Notes / Instructions</label>
              <textarea 
                className="form-control"
                rows={2}
                placeholder="e.g. Remember to ask for Bob specifically. Mention our summer floor mat special..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </form>

      {/* Filter and Tab Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'hsl(var(--bg-secondary) / 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
        {/* Period tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '0.1rem' }}>
          <button 
            type="button" 
            className={`filter-tab ${filterPeriod === 'all' ? 'active' : ''}`}
            onClick={() => setFilterPeriod('all')}
            style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem' }}
          >
            All Periods
          </button>
          <button 
            type="button" 
            className={`filter-tab ${filterPeriod === 'day' ? 'active' : ''}`}
            onClick={() => setFilterPeriod('day')}
            style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem' }}
          >
            Today
          </button>
          <button 
            type="button" 
            className={`filter-tab ${filterPeriod === 'week' ? 'active' : ''}`}
            onClick={() => setFilterPeriod('week')}
            style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem' }}
          >
            This Week
          </button>
          <button 
            type="button" 
            className={`filter-tab ${filterPeriod === 'later' ? 'active' : ''}`}
            onClick={() => setFilterPeriod('later')}
            style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem' }}
          >
            Later
          </button>
        </div>

        {/* Secondary dropdown filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
          <select 
            className="form-control"
            style={{ padding: '0.25rem', fontSize: '0.72rem', height: '28px' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="pending">Pending Tasks</option>
            <option value="completed">Completed</option>
            <option value="all">All Tasks</option>
          </select>

          <select 
            className="form-control"
            style={{ padding: '0.25rem', fontSize: '0.72rem', height: '28px' }}
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
          >
            <option value="all">All Priorities</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'hsl(var(--text-secondary))' }}>
            <input 
              type="checkbox"
              id="leadLinked"
              style={{ width: '13px', height: '13px', accentColor: 'hsl(var(--primary))' }}
              checked={filterLeadLinked}
              onChange={(e) => setFilterLeadLinked(e.target.checked)}
            />
            <label htmlFor="leadLinked" style={{ cursor: 'pointer' }}>Lead Linked</label>
          </div>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '1rem' }}>Loading tasks...</span>
      ) : filteredTodos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'hsl(var(--text-muted))', fontSize: '0.8rem', fontStyle: 'italic' }}>
          No tasks found matching current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
          {filteredTodos.map(todo => {
            const isHigh = todo.priority === 'high';
            const isMed = todo.priority === 'medium';
            
            const priorityColor = isHigh 
              ? 'hsl(var(--danger))' 
              : isMed 
                ? 'hsl(var(--warning))' 
                : 'hsl(var(--primary))';

            return (
              <div 
                key={todo.id}
                className="glass-card"
                style={{ 
                  padding: '0.65rem 0.85rem', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.35rem',
                  borderLeft: `3px solid ${priorityColor}`,
                  opacity: todo.completed ? 0.6 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  {/* Custom check button */}
                  <button 
                    type="button" 
                    onClick={() => handleToggleComplete(todo)}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      padding: 0, 
                      cursor: 'pointer', 
                      color: todo.completed ? 'hsl(var(--success))' : 'hsl(var(--text-muted))',
                      display: 'flex',
                      alignItems: 'center',
                      marginTop: '0.1rem'
                    }}
                  >
                    {todo.completed ? <CheckCircle style={{ width: '16px', height: '16px' }} /> : <Circle style={{ width: '16px', height: '16px' }} />}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.2rem' }}>
                    {/* Task Text */}
                    <span 
                      style={{ 
                        fontSize: '0.82rem', 
                        fontWeight: 600, 
                        color: 'hsl(var(--text-primary))',
                        textDecoration: todo.completed ? 'line-through' : 'none'
                      }}
                    >
                      {todo.text}
                    </span>

                    {/* Metadata Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginTop: '0.1rem' }}>
                      {/* Priority badge */}
                      <span style={{ 
                        fontSize: '0.62rem', 
                        padding: '0.08rem 0.35rem', 
                        borderRadius: '4px', 
                        background: `hsl(${isHigh ? 'var(--danger-glow)' : isMed ? 'var(--warning-glow)' : 'var(--primary-glow)'})`, 
                        color: priorityColor, 
                        fontWeight: 700, 
                        textTransform: 'uppercase',
                        border: `1px solid ${priorityColor}30`
                      }}>
                        {todo.priority}
                      </span>

                      {/* Period Badge */}
                      <span style={{ 
                        fontSize: '0.62rem', 
                        padding: '0.08rem 0.35rem', 
                        borderRadius: '4px', 
                        background: 'hsl(var(--bg-secondary))', 
                        color: 'hsl(var(--text-muted))',
                        border: '1px solid hsl(var(--border-muted))'
                      }}>
                        {todo.period === 'day' ? 'Today' : todo.period === 'week' ? 'This Week' : 'Later'}
                      </span>

                      {/* Due date badge */}
                      {todo.dueDate && (
                        <span style={{ 
                          fontSize: '0.62rem', 
                          padding: '0.08rem 0.35rem', 
                          borderRadius: '4px', 
                          background: 'hsl(var(--bg-secondary))', 
                          color: 'hsl(var(--secondary))',
                          border: '1px solid hsl(var(--secondary) / 0.2)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.15rem'
                        }}>
                          <Calendar style={{ width: '10px', height: '10px' }} />
                          {new Date(todo.dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}

                      {/* Lead linked pill */}
                      {todo.leadId && (
                        <span 
                          style={{ 
                            fontSize: '0.62rem', 
                            padding: '0.08rem 0.35rem', 
                            borderRadius: '4px', 
                            background: 'hsl(var(--primary-glow))', 
                            color: 'hsl(var(--primary))',
                            border: '1px solid hsl(var(--primary) / 0.2)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.15rem'
                          }}
                          title={`Linked Lead: ${todo.leadName}`}
                        >
                          <Briefcase style={{ width: '10px', height: '10px' }} />
                          {todo.leadName || 'Linked Lead'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    {/* Expand notes */}
                    {todo.notes && (
                      <button 
                        type="button" 
                        onClick={() => toggleNotes(todo.id)}
                        style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', display: 'flex', padding: '2px' }}
                      >
                        <FileText style={{ width: '14px', height: '14px' }} />
                      </button>
                    )}

                    {/* Trash */}
                    <button 
                      type="button" 
                      onClick={() => handleDeleteTodo(todo.id)}
                      style={{ background: 'transparent', border: 'none', color: 'hsl(var(--danger))', cursor: 'pointer', display: 'flex', padding: '2px' }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>

                {/* Expanded notes description */}
                {todo.notes && expandedNotes[todo.id] && (
                  <div 
                    style={{ 
                      fontSize: '0.74rem', 
                      color: 'hsl(var(--text-secondary))', 
                      background: 'hsl(var(--bg-secondary) / 0.5)', 
                      padding: '0.4rem 0.6rem', 
                      borderRadius: '6px', 
                      marginTop: '0.25rem',
                      borderLeft: '2px solid hsl(var(--border-muted))',
                      whiteSpace: 'pre-line',
                      animation: 'scaleUp 0.15s ease-out'
                    }}
                  >
                    {todo.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TodoList;
