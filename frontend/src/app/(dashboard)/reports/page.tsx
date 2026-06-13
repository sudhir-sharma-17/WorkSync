"use client";

import React, { useState } from "react";
import { FileBarChart, Calendar, FileSpreadsheet, Layers, Briefcase, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const workerHours = [
  { name: "NARESH", hours: 160, role: "Carpenter" },
  { name: "PRABHU POLISHER", hours: 144, role: "Polisher" },
  { name: "GANESH", hours: 152, role: "Painter" },
  { name: "RAMESH", hours: 120, role: "Carpenter" },
  { name: "SURESH", hours: 80, role: "Painter" },
];

const boqDistribution = [
  { name: "Manufactured Cabinetry", value: 280, color: "#0d9488" },
  { name: "Painting Works", value: 232, color: "#0284c7" },
  { name: "Polishing Works", value: 144, color: "#f59e0b" },
];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("May 2026");

  const totalManHours = workerHours.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="space-y-8 relative z-10">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Attendance Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Synthesize worker time logs and evaluate resource cost distribution models.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Calendar size={14} />
          <span>Period: {dateRange}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="p-3.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-2xl">
            <Briefcase size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Total Man-Hours</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">{totalManHours} hrs</span>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="p-3.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Layers size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">BOQ Class Divisions</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">3 Active Categories</span>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl">
            <Award size={24} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Peak Category</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">Cabinetry</span>
          </div>
        </div>
      </div>

      {/* Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Worker Hours Graph */}
        <div className="glass-panel p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FileBarChart size={18} className="text-teal-600 dark:text-teal-400" />
              Hours Logged per Worker
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workerHours} layout="vertical" margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} width={110} />
                <Tooltip 
                  contentStyle={{ 
                    background: "rgba(15, 23, 42, 0.9)", 
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    color: "#f8fafc"
                  }} 
                />
                <Bar dataKey="hours" fill="var(--accent-teal)" radius={[0, 4, 4, 0]} name="Logged Hours" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Distribution Graph */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <h3 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
            <Layers size={18} className="text-blue-600 dark:text-blue-400" />
            BOQ Shift Volume Split
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center flex-1">
            <div className="h-48 w-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    contentStyle={{ 
                      background: "rgba(15, 23, 42, 0.9)", 
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      color: "#f8fafc"
                    }} 
                  />
                  <Pie
                    data={boqDistribution}
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {boqDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-slate-400 font-bold uppercase">Total Shifts</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-white mt-0.5">
                  {boqDistribution.reduce((a, b) => a + b.value, 0)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {boqDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.name}</span>
                    <span className="text-[10px] text-slate-400">{item.value} submissions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
