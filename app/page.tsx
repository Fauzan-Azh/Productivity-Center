"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Clock, Activity, Calendar as CalendarIcon, Pencil, Trash2, X as XIcon, Check, Plus, Save, Sunrise, Sun, Sunset, Moon } from "lucide-react";

type Priority = 1 | 2 | 3;
type Status = "Belum Mulai" | "Selesai";
type ShiftPeriod = "Semua" | "Pagi" | "Siang" | "Malam";

interface Task {
  id: string;
  date: string;
  start_time: string;
  title: string;
  priority: Priority;
  status: Status;
}

const getYYYYMMDD = (date: Date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

// Pemetaan Jam ke dalam Shift
const HOURS_MAPPING = {
  Pagi: ["04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00"],
  Siang: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
  Malam: ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00"],
};

const ALL_HOURS = [...HOURS_MAPPING.Pagi, ...HOURS_MAPPING.Siang, ...HOURS_MAPPING.Malam];

// Konfigurasi Visual Shift (Warna & Ikon)
const SHIFT_CONFIG = {
  Semua: { color: "indigo", icon: Activity, hover: "hover:bg-indigo-50/50" },
  Pagi: { color: "sky", icon: Sunrise, hover: "hover:bg-sky-50/50" },
  Siang: { color: "amber", icon: Sun, hover: "hover:bg-amber-50/70" },
  Malam: { color: "violet", icon: Moon, hover: "hover:bg-violet-50/50" },
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const [time, setTime] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateStr = getYYYYMMDD(selectedDate);

  // State untuk filter Shift aktif
  const [activeShift, setActiveShift] = useState<ShiftPeriod>("Semua");

  const [drafts, setDrafts] = useState<Record<string, { title: string; priority: Priority }>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ title: "", priority: 3 as Priority });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prayerTimes, setPrayerTimes] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredHours = useMemo(() => {
    if (activeShift === "Semua") return ALL_HOURS;
    return HOURS_MAPPING[activeShift];
  }, [activeShift]);

  useEffect(() => {
    const fetchPrayerTimes = async () => {
      try {
        const formattedDate = `${selectedDate.getDate()}-${selectedDate.getMonth() + 1}-${selectedDate.getFullYear()}`;
        const res = await fetch(`https://api.aladhan.com/v1/timingsByCity/${formattedDate}?city=Jakarta%20Selatan&country=Indonesia&method=11`);
        const data = await res.json();
        setPrayerTimes(data.data.timings);
      } catch (error) {
        console.error("Gagal mengambil jadwal sholat:", error);
      }
    };
    fetchPrayerTimes();
  }, [selectedDateStr]);

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) throw error;
      return data as Task[];
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string, newStatus: Status }) => {
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ hour, title, priority }: { hour: string, title: string, priority: Priority }) => {
      const { error } = await supabase.from('tasks').insert([{ 
        title, start_time: hour, priority, category: "-", date: selectedDateStr, status: 'Belum Mulai' 
      }]);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDrafts(prev => ({ ...prev, [variables.hour]: { title: "", priority: 3 } })); 
    },
    onError: (error: any) => setErrorMsg(error.message)
  });

  const editTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: typeof editFormData }) => {
      const { error } = await supabase.from('tasks').update({ title: data.title, priority: data.priority }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTaskId(null);
    },
    onError: (error: any) => setErrorMsg(error.message)
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (error: any) => setErrorMsg(error.message)
  });

  const handleDraftChange = (hour: string, field: 'title' | 'priority', value: any) => {
    setDrafts(prev => ({
      ...prev,
      [hour]: { ...(prev[hour] || { title: "", priority: 3 }), [field]: value }
    }));
  };

  const tasksForSelectedDate = useMemo(() => allTasks.filter(t => t.date === selectedDateStr), [allTasks, selectedDateStr]);

  const calculateProgress = (tasksArray: Task[]) => {
    if (tasksArray.length === 0) return 0;
    return Math.round((tasksArray.filter(t => t.status === "Selesai").length / tasksArray.length) * 100);
  };

  const dailyProgress = calculateProgress(tasksForSelectedDate);

  const weeklyProgress = useMemo(() => {
    const start = new Date(selectedDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return calculateProgress(allTasks.filter(t => t.date >= getYYYYMMDD(start) && t.date <= getYYYYMMDD(end)));
  }, [allTasks, selectedDate]);

  const monthlyProgress = useMemo(() => {
    const currentMonthStr = selectedDateStr.slice(0, 7);
    return calculateProgress(allTasks.filter(t => t.date.startsWith(currentMonthStr)));
  }, [allTasks, selectedDateStr]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center font-mono text-xs tracking-wider text-indigo-400 animate-pulse">
        INITIALIZING VIBRANT WORKSPACE...
      </div>
    );
  }

  const currentShiftVisual = SHIFT_CONFIG[activeShift];

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-neutral-900 px-6 py-8 antialiased selection:bg-indigo-100">
      <div className="max-w-[1440px] mx-auto">
        
        {/* TOP META ROW */}
        <header className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-neutral-200/70 pb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 flex items-center gap-2.5">
               <span className="text-indigo-600">Fauzan Azhima's Productivity</span>  Center
            </h1>
            <p className="text-xs font-mono text-neutral-500 uppercase mt-1.5 tracking-wider bg-neutral-100 px-2 py-0.5 rounded inline-block">
              {time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })} // {time.toLocaleTimeString('id-ID')}
            </p>
          </div>
          
          {/* DATE PICKER */}
          <div className="flex items-center bg-white border border-neutral-200 px-4 py-2 rounded-xl shadow-sm hover:border-indigo-200 transition">
            <CalendarIcon size={15} className="text-indigo-400 mr-2.5" />
            <input 
              type="date" 
              value={selectedDateStr}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="bg-transparent text-sm font-semibold text-neutral-800 outline-none cursor-pointer font-sans"
            />
          </div>
        </header>

        {/* ASYMMETRIC GRID SYSTEM */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          
          {/* LEFT CONTENT: THE MANAGEMENT GRID */}
          <div className="lg:col-span-8 bg-white border border-neutral-200/70 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
            
            {/* SHIFT SYSTEM CONTROLLER */}
            <div className={`flex items-center justify-between border-b border-neutral-100 bg-${currentShiftVisual.color}-50/40 px-6 py-4`}>
              <div className="flex items-center gap-3">
                <currentShiftVisual.icon className={`text-${currentShiftVisual.color}-500`} size={18} />
                <span className={`text-sm font-semibold tracking-tight text-${currentShiftVisual.color}-950`}>Time Blocks / {activeShift}</span>
              </div>
              <div className="flex bg-neutral-100 p-1 rounded-xl border border-neutral-200/50">
                {(["Semua", "Pagi", "Siang", "Malam"] as ShiftPeriod[]).map((shift) => {
                    const cfg = SHIFT_CONFIG[shift];
                    const isActive = activeShift === shift;
                    return (
                        <button
                            key={shift}
                            onClick={() => setActiveShift(shift)}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 
                                ${isActive 
                                    ? `bg-white text-${cfg.color}-700 shadow-sm` 
                                    : `text-neutral-500 hover:text-${cfg.color}-600`
                                }`}
                        >
                            <cfg.icon size={13} className={isActive ? `text-${cfg.color}-500`: `text-neutral-400`} />
                            {shift}
                        </button>
                    );
                })}
              </div>
            </div>

            {errorMsg && (
              <div className="m-4 p-4 bg-red-950 text-red-100 rounded-xl text-xs font-mono flex justify-between items-center shadow-lg border border-red-800">
                <span>[DATABASE_ERROR] // {errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="hover:text-white p-1 rounded-full hover:bg-red-800"><XIcon size={16}/></button>
              </div>
            )}

            {/* FLAT DENSE TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-neutral-500 uppercase tracking-wider font-semibold border-b border-neutral-100 bg-neutral-50/50">
                    <th className="py-4 px-6 w-16 text-center">Done</th>
                    <th className="py-4 px-4 w-20">Waktu</th>
                    <th className="py-4 px-4">Rencana Kegiatan</th>
                    <th className="py-4 px-4 w-28">Prioritas</th>
                    <th className="py-4 px-6 w-28 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-neutral-100/70">
                  
                  {filteredHours.map((hour) => {
                    const task = tasksForSelectedDate.find(t => t.start_time.startsWith(hour.substring(0, 2)));
                    const draft = drafts[hour] || { title: "", priority: 3 };
                    const isEditing = task && editingTaskId === task.id;

                    let rowHoverColor = SHIFT_CONFIG.Semua.hover; 
                    if (HOURS_MAPPING.Pagi.includes(hour)) rowHoverColor = SHIFT_CONFIG.Pagi.hover;
                    else if (HOURS_MAPPING.Siang.includes(hour)) rowHoverColor = SHIFT_CONFIG.Siang.hover;
                    else if (HOURS_MAPPING.Malam.includes(hour)) rowHoverColor = SHIFT_CONFIG.Malam.hover;

                    return (
                      <tr key={hour} className={`group transition-colors duration-100 min-h-[56px] ${task ? rowHoverColor : ''}`}>
                        
                        {/* COLUMN 1: INTEGRATED CHECKBOX STATUS */}
                        <td className="py-3 px-6 align-middle text-center">
                          {task ? (
                            <button 
                              onClick={() => toggleStatusMutation.mutate({ id: task.id, newStatus: task.status === "Selesai" ? "Belum Mulai" : "Selesai" })}
                              className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center transform active:scale-95
                                ${task.status === "Selesai" 
                                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-inner' 
                                    : 'border-neutral-300 hover:border-emerald-400 bg-white hover:bg-emerald-50'
                                }`}
                            >
                              {task.status === "Selesai" && <Check size={12} strokeWidth={4} />}
                            </button>
                          ) : (
                            <div className="w-5 h-5 rounded-md border-2 border-dashed border-neutral-200 bg-neutral-50 pointer-events-none" />
                          )}
                        </td>

                        {/* COLUMN 2: TIME */}
                        <td className="py-3 px-4 align-middle font-sans text-sm tracking-tight font-medium text-neutral-400 group-hover:text-neutral-900 transition-colors">
                          {hour}
                        </td>

                        {/* COLUMN 3: MAIN WORK CONTENT */}
                        {isEditing ? (
                          <>
                            <td className="py-3 px-4 align-middle">
                              <input 
                                type="text" autoFocus
                                className="w-full bg-white border-2 border-indigo-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 shadow-inner"
                                value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})}
                                onKeyDown={(e) => { if (e.key === 'Enter') editTaskMutation.mutate({ id: task.id, data: editFormData }); }}
                              />
                            </td>
                            <td className="py-3 px-4 align-middle">
                              <select 
                                className="w-full bg-white border-2 border-indigo-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-semibold"
                                value={editFormData.priority} onChange={e => setEditFormData({...editFormData, priority: Number(e.target.value) as Priority})}
                              >
                                <option value={1}>Tinggi</option>
                                <option value={2}>Sedang</option>
                                <option value={3}>Rendah</option>
                              </select>
                            </td>
                            <td className="py-3 px-6 align-middle text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => editTaskMutation.mutate({ id: task.id, data: editFormData })}
                                  className="p-1.5 text-indigo-700 hover:bg-indigo-100 rounded-lg transition"
                                >
                                  <Check size={16} strokeWidth={2.5} />
                                </button>
                                <button 
                                  onClick={() => setEditingTaskId(null)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                                >
                                  <XIcon size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : task ? (
                          <>
                            <td className="py-3 px-4 align-middle">
                              <span className={`font-semibold text-[15px] ${task.status === 'Selesai' ? 'line-through text-neutral-300 font-normal' : 'text-neutral-900'}`}>
                                {task.title}
                              </span>
                            </td>
                            <td className="py-3 px-4 align-middle">
                              <span className={`text-[11px] uppercase font-bold tracking-wider px-3 py-1 rounded-full
                                ${task.priority === 1 ? 'text-red-700 bg-red-100 border border-red-200' : task.priority === 2 ? 'text-amber-800 bg-amber-100 border border-amber-200' : 'text-emerald-800 bg-emerald-50 border border-emerald-100'}`}>
                                P{task.priority} // {task.priority === 1 ? 'High' : task.priority === 2 ? 'Mid' : 'Low'}
                              </span>
                            </td>
                            <td className="py-3 px-6 align-middle text-right">
                              <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                <button 
                                  onClick={() => { setEditingTaskId(task.id); setEditFormData({ title: task.title, priority: task.priority }); }}
                                  className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Ubah Rencana"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button 
                                  onClick={() => { if(confirm('Hapus rencana jam ini?')) deleteTaskMutation.mutate(task.id); }}
                                  className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Hapus"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-1 px-4 align-middle relative">
                              <input 
                                type="text"
                                className="w-full bg-transparent border-none px-1 py-2 text-sm font-medium text-neutral-950 outline-none focus:bg-indigo-50/50 rounded-t-lg transition placeholder:text-neutral-200"
                                placeholder="Tulis rencana..."
                                value={draft.title} onChange={e => handleDraftChange(hour, 'title', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && draft.title) addTaskMutation.mutate({ hour, ...draft }); }}
                              />
                            </td>
                            <td className="py-1 px-4 align-middle">
                              <div className={`transition-all duration-200 ${draft.title ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
                                <select 
                                  className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-400 text-neutral-700 font-semibold"
                                  value={draft.priority} onChange={e => handleDraftChange(hour, 'priority', Number(e.target.value) as Priority)}
                                >
                                  <option value={1}>P1 - Tinggi</option>
                                  <option value={2}>P2 - Sedang</option>
                                  <option value={3}>P3 - Rendah</option>
                                </select>
                              </div>
                            </td>
                            <td className="py-1 px-6 align-middle text-right">
                              <div className={`transition-all duration-200 ${draft.title ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
                                <button 
                                  onClick={() => addTaskMutation.mutate({ hour, ...draft })}
                                  disabled={addTaskMutation.isPending}
                                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition shadow active:scale-95 disabled:opacity-50"
                                >
                                  <Save size={14} /> Simpan
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT CONTENT: THE METRICS & SCHEDULER BAR */}
          <div className="lg:col-span-4 flex flex-col gap-10 sticky top-8">
            
            {/* PERFORMANCE METRICS CONTAINER */}
            <div className="bg-white border border-neutral-200/70 rounded-2xl p-7 shadow-sm">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-2.5 mb-8">
                <div className="w-1.5 h-4 bg-indigo-500 rounded"></div>
                Performance Metrics
              </h3>
              
              <div className="space-y-6">
                {[
                  { label: "Progres Harian", val: dailyProgress, from: "from-emerald-400", to: "to-emerald-500" },
                  { label: "Rata-rata Mingguan", val: weeklyProgress, from: "from-sky-400", to: "to-sky-500" },
                  { label: "Stabilitas Bulanan", val: monthlyProgress, from: "from-indigo-400", to: "to-indigo-500" }
                ].map((m, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-xs font-semibold text-neutral-700">{m.label}</span>
                      <span className="text-lg font-bold font-mono text-neutral-950">{m.val}<span className="text-xs text-neutral-400">%</span></span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden border border-neutral-200/50 shadow-inner">
                      <div className={`bg-gradient-to-r ${m.from} ${m.to} h-2 rounded-full transition-all duration-700 ease-out`} style={{ width: `${m.val}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRAYER TIMES */}
            <div className="bg-white border border-neutral-200/70 rounded-2xl p-7 shadow-sm">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-400 flex justify-between items-center mb-8 gap-2">
                <div className="flex items-center gap-2.5"><Sun size={14} className="text-amber-500" /> Prayer Schedule</div>
                <span className="text-[10px] font-mono font-medium border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-600 bg-neutral-50">
                  JAKARTA SELATAN / {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
              </h3>
              <ul className="space-y-4">
                {['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((prayer) => {
                  const label = prayer === 'Fajr' ? 'Subuh' : prayer === 'Dhuhr' ? 'Dzuhur' : prayer === 'Asr' ? 'Ashar' : prayer === 'Maghrib' ? 'Maghrib' : 'Isya';
                  const iconColor = prayer === 'Fajr' ? 'text-sky-400' : prayer === 'Maghrib' ? 'text-orange-400' : 'text-amber-400';
                  
                  return (
                    <li key={prayer} className="flex justify-between items-center text-sm text-neutral-700 bg-neutral-50/50 border border-neutral-100 px-4 py-3 rounded-xl transition hover:border-amber-100 hover:bg-amber-50/50">
                      <span className="font-semibold text-neutral-800 flex items-center gap-2.5">
                        <Sunrise size={14} className={iconColor} />
                        {label}
                      </span>
                      <span className="font-mono bg-white border border-neutral-200 px-2.5 py-1 rounded-md text-neutral-950 font-bold text-xs shadow-inner">
                        {prayerTimes[prayer] || '--:--'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}