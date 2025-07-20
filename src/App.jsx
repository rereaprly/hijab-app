import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Home, Tag, Edit, Upload, List, BrainCircuit, FileText, LogOut, Loader2, TrendingUp, TrendingDown, Eye, EyeOff, Trash2, PlusCircle, X, CheckCircle, FileUp, FileCheck2, AlertTriangle, Filter, RotateCcw, SlidersHorizontal, Zap, Printer, UserCheck, KeyRound, ExternalLink } from 'lucide-react';

// Import Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc,
    writeBatch,
    query,
    orderBy,
    where,
    getDocs,
    updateDoc,
    getDoc
} from "firebase/firestore";


// --- KONFIGURASI FIREBASE ---
// Konfigurasi dari proyek Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyAUucKV1nEK_vhm7gammKrjR5VJX34jB2I",
  authDomain: "prediksi-hijab.firebaseapp.com",
  projectId: "prediksi-hijab",
  storageBucket: "prediksi-hijab.firebasestorage.app",
  messagingSenderId: "710662677447",
  appId: "1:710662677447:web:c2893e4b4afc9f2bbf2fe2",
  measurementId: "G-RD795600VP"
};

// --- FUNGSI MODEL PREDIKSI & OPTIMISASI (Tidak berubah) ---
const calculateMSE = (actual, forecast) => { let sum = 0; const len = Math.min(actual.length, forecast.length); for (let i = 0; i < len; i++) { sum += Math.pow(actual[i] - forecast[i], 2); } return sum / len; };
const getSESForecasts = (data, alpha) => { if (!data || data.length === 0) return { forecast: 0, historical: [] }; let smoothed = [data[0]]; for (let i = 1; i < data.length; i++) { smoothed[i] = alpha * data[i] + (1 - alpha) * smoothed[i - 1]; } const forecast = alpha * data[data.length - 1] + (1 - alpha) * smoothed[smoothed.length - 1]; const historical = [data[0], ...smoothed.slice(0, -1)]; return { forecast, historical }; };
const findBestSESParams = (data) => { let bestAlpha = 0.1; let minMse = Infinity; for (let alpha = 0.1; alpha <= 0.9; alpha += 0.1) { const { historical } = getSESForecasts(data, alpha); const mse = calculateMSE(data, historical); if (mse < minMse) { minMse = mse; bestAlpha = alpha; } } return { alpha: bestAlpha, mse: minMse }; };
const getHoltForecasts = (data, alpha, beta) => { if (!data || data.length < 2) return { forecast: 0, historical: [] }; let level = [data[0]]; let trend = [data[1] - data[0]]; let historical = [data[0]]; for (let i = 1; i < data.length; i++) { historical.push(level[i-1] + trend[i-1]); level[i] = alpha * data[i] + (1 - alpha) * (level[i - 1] + trend[i - 1]); trend[i] = beta * (level[i] - level[i - 1]) + (1 - beta) * trend[i - 1]; } const forecast = level[level.length - 1] + trend[trend.length - 1]; return { forecast, historical }; };
const findBestHoltParams = (data) => { let bestAlpha = 0.1, bestBeta = 0.1; let minMse = Infinity; for (let alpha = 0.1; alpha <= 0.9; alpha += 0.1) { for (let beta = 0.1; beta <= 0.9; beta += 0.1) { const { historical } = getHoltForecasts(data, alpha, beta); const mse = calculateMSE(data, historical); if (mse < minMse) { minMse = mse; bestAlpha = alpha; bestBeta = beta; } } } return { alpha: bestAlpha, beta: bestBeta, mse: minMse }; };
const getLRForecasts = (data) => { if (!data || data.length === 0) return { forecast: 0, historical: [] }; const n = data.length; let historical = []; for (let i = 1; i <= n; i++) { const subData = data.slice(0, i); const subN = subData.length; if (subN < 2) { historical.push(subData[0] || 0); continue; } let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0; subData.forEach((y, j) => { const x = j + 1; sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; }); const slope = (subN * sumXY - sumX * sumY) / (subN * sumX2 - sumX * sumX) || 0; const intercept = (sumY - slope * sumX) / subN; historical.push(slope * i + intercept); } const forecast = historical.pop(); historical.unshift(data[0]); return { forecast, historical: historical.slice(0, n) }; };
const findBestWeights = (data, sesParams, holtParams) => { const sesForecasts = getSESForecasts(data, sesParams.alpha).historical; const holtForecasts = getHoltForecasts(data, holtParams.alpha, holtParams.beta).historical; const lrForecasts = getLRForecasts(data).historical; const mseSES = calculateMSE(data, sesForecasts); const mseHolt = calculateMSE(data, holtForecasts); const mseLR = calculateMSE(data, lrForecasts); const invMSE_SES = 1 / (mseSES || 1e-6); const invMSE_Holt = 1 / (mseHolt || 1e-6); const invMSE_LR = 1 / (mseLR || 1e-6); const totalInvMSE = invMSE_SES + invMSE_Holt + invMSE_LR; if (totalInvMSE === 0) return { ses: 1/3, holt: 1/3, lr: 1/3 }; return { ses: invMSE_SES / totalInvMSE, holt: invMSE_Holt / totalInvMSE, lr: invMSE_LR / totalInvMSE, }; };

// --- KOMPONEN UI ---
const FirebaseSetupMessage = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 font-sans">
        <div className="w-full max-w-2xl p-8 space-y-6 bg-white rounded-2xl shadow-lg text-center border-t-4 border-yellow-400">
            <KeyRound size={64} className="mx-auto text-yellow-500" />
            <h1 className="text-3xl font-bold text-gray-800">Konfigurasi Firebase Diperlukan</h1>
            <p className="text-gray-600">
                Aplikasi ini perlu terhubung ke proyek Firebase Anda. Ada 2 langkah penting:
            </p>
            <div className="text-left space-y-4">
                <div>
                    <h2 className="font-bold text-lg">Langkah 1: Salin Konfigurasi Proyek</h2>
                    <ol className="list-decimal list-inside space-y-2 p-3 bg-gray-50 rounded-lg mt-2">
                        <li>Buka konsol Firebase Anda di <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.firebase.google.com <ExternalLink size={14} className="inline-block ml-1"/></a></li>
                        <li>Pilih proyek Anda (`prediksi-hijab`).</li>
                        <li>Klik ikon roda gigi (Pengaturan Proyek).</li>
                        <li>Di tab "Umum", salin objek `firebaseConfig`.</li>
                        <li>Tempel objek tersebut untuk menggantikan variabel `firebaseConfig` di dalam kode.</li>
                    </ol>
                </div>
                <div>
                    <h2 className="font-bold text-lg">Langkah 2: Aktifkan Login Anonim</h2>
                     <ol className="list-decimal list-inside space-y-2 p-3 bg-gray-50 rounded-lg mt-2">
                        <li>Di menu sebelah kiri, masuk ke <span className="font-mono bg-gray-200 px-1 rounded">Authentication</span>.</li>
                        <li>Pilih tab <span className="font-mono bg-gray-200 px-1 rounded">Sign-in method</span>.</li>
                        <li>Cari "Anonim" di daftar penyedia, lalu klik dan aktifkan (enable).</li>
                    </ol>
                </div>
            </div>
             <p className="text-sm text-gray-500 pt-4">
                Setelah kedua langkah selesai, aplikasi akan berfungsi secara otomatis.
            </p>
        </div>
    </div>
);
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, children }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-lg font-bold text-gray-800">{title}</h3><div className="mt-2 text-sm text-gray-600">{children}</div><div className="mt-6 flex justify-end space-x-3"><button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Batal</button><button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Hapus</button></div></div></div>); };
const LoginPage = ({ onLogin }) => { const [isLoading, setIsLoading] = useState(false); const handleLogin = () => { setIsLoading(true); onLogin().catch(err => { alert("Gagal melakukan login anonim. Pastikan metode login 'Anonim' sudah diaktifkan di konsol Firebase Anda."); console.error(err); setIsLoading(false); }); }; return (<div className="flex items-center justify-center min-h-screen bg-gray-100 font-sans"><div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg text-center"><UserCheck size={64} className="mx-auto text-green-500" /><h1 className="text-3xl font-bold text-gray-800">Aplikasi Prediksi Tren</h1><p className="mt-2 text-gray-600">Masuk untuk menyimpan data Anda secara aman di cloud dan mengaksesnya dari mana saja.</p><div className="pt-4"><button onClick={handleLogin} disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300">{isLoading ? <Loader2 className="animate-spin" /> : 'Masuk Secara Anonim'}</button></div></div></div>); };
const Sidebar = ({ activePage, setPage, onLogout }) => { const menuItems = [{ id: 'dashboard', label: 'Dashboard', icon: Home },{ id: 'kelola-kategori', label: 'Kelola Kategori', icon: Tag },{ id: 'input-data', label: 'Input Data', icon: Edit },{ id: 'upload-csv', label: 'Upload CSV', icon: Upload },{ id: 'lihat-data', label: 'Lihat Data', icon: List },{ id: 'prediksi', label: 'Prediksi', icon: BrainCircuit },{ id: 'laporan', label: 'Laporan', icon: FileText },]; return (<div className="flex flex-col h-full bg-[#2F4F4F] text-white w-64 p-4 space-y-4"><div className="text-2xl font-bold text-center py-4 border-b border-gray-500">Prediksi Tren</div><nav className="flex-grow"><ul>{menuItems.map(item => (<li key={item.id} className="mb-2"><a href="#" onClick={(e) => { e.preventDefault(); setPage(item.id); }} className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${activePage === item.id ? 'bg-green-400 bg-opacity-30 text-white' : 'hover:bg-green-500 hover:bg-opacity-20 text-gray-300'}`}><item.icon className="mr-4" size={20} /><span>{item.label}</span></a></li>))}</ul></nav><div><button onClick={onLogout} className="flex items-center w-full p-3 rounded-lg transition-colors duration-200 hover:bg-red-500 hover:bg-opacity-20 text-gray-300"><LogOut className="mr-4" size={20} /><span>Keluar</span></button></div></div>); };
const DashboardPage = ({ products }) => ( <div className="p-8"><h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4"><div className="p-3 bg-blue-100 rounded-full"><Tag className="text-blue-500" /></div><div><p className="text-gray-500">Total Produk</p><p className="text-2xl font-bold">{products.length}</p></div></div><div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4"><div className="p-3 bg-green-100 rounded-full"><TrendingUp className="text-green-500" /></div><div><p className="text-gray-500">Produk Terlaris (Bulan Ini)</p><p className="text-xl font-bold">Pashmina Ceruty</p></div></div><div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4"><div className="p-3 bg-red-100 rounded-full"><TrendingDown className="text-red-500" /></div><div><p className="text-gray-500">Produk Kurang Laris</p><p className="text-xl font-bold">Hijab Voal Motif</p></div></div></div><div className="mt-8 bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Ringkasan Penjualan 6 Bulan Terakhir</h2><ResponsiveContainer width="100%" height={300}><LineChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" label={{ value: 'Minggu ke-', position: 'insideBottom', offset: -5 }} /><YAxis label={{ value: 'Penjualan', angle: -90, position: 'insideLeft' }}/><Tooltip /><Legend />{products.slice(0, 2).map((p, index) => (<Line key={p.id} type="monotone" dataKey="sales" data={p.history} name={p.name} stroke={index === 0 ? "#8884d8" : "#82ca9d"} activeDot={{ r: 8 }} />))}</LineChart></ResponsiveContainer></div></div>);
const LihatDataPage = ({ products, categories, onDeleteEntry }) => { const [filterCategory, setFilterCategory] = useState(''); const [filterWeek, setFilterWeek] = useState(''); const [filteredData, setFilteredData] = useState([]); const [isModalOpen, setIsModalOpen] = useState(false); const [entryToDelete, setEntryToDelete] = useState(null); const allSalesData = useMemo(() => { return products.flatMap(product => product.history.map(entry => ({ ...entry, id: `${product.id}-${entry.week}`, productId: product.id, category: product.category, productName: product.name, }))).sort((a, b) => a.week - b.week || a.category.localeCompare(b.category)); }, [products]); useEffect(() => { let data = allSalesData; if (filterCategory) { data = data.filter(d => d.category === filterCategory); } if (filterWeek) { data = data.filter(d => d.week === parseInt(filterWeek)); } setFilteredData(data); }, [filterCategory, filterWeek, allSalesData]); const handleReset = () => { setFilterCategory(''); setFilterWeek(''); }; const handleDeleteClick = (entry) => { setEntryToDelete(entry); setIsModalOpen(true); }; const confirmDelete = () => { onDeleteEntry(entryToDelete.productId, entryToDelete.week); setIsModalOpen(false); setEntryToDelete(null); }; return (<><ConfirmModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={confirmDelete} title="Konfirmasi Hapus Data"><p>Apakah Anda yakin ingin menghapus data penjualan untuk <strong>{entryToDelete?.productName}</strong> pada minggu ke-<strong>{entryToDelete?.week}</strong>?</p></ConfirmModal><div className="p-8 space-y-6"><h1 className="text-3xl font-bold text-gray-800">Lihat Data Penjualan</h1><div className="bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Filter Data Penjualan</h2><div className="flex flex-wrap items-end gap-4"><div className="flex-grow"><label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full p-2 border rounded-md bg-gray-50"><option value="">-- Semua Kategori --</option>{categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select></div><div className="flex-grow"><label className="block text-sm font-medium text-gray-700 mb-1">Filter Minggu ke-</label><input type="number" placeholder="Contoh: 5" value={filterWeek} onChange={e => setFilterWeek(e.target.value)} className="w-full p-2 border rounded-md bg-gray-50" /></div><button onClick={handleReset} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center gap-2"><RotateCcw size={16} /> Reset</button></div></div><div className="bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Data Penjualan</h2><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-800 text-white"><tr><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Minggu Ke</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Kategori</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Jumlah Penjualan</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Trend Score</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Tgl Input</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Aksi</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{filteredData.length > 0 ? filteredData.map((entry) => (<tr key={entry.id} className="hover:bg-gray-50"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.week}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.category}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.sales}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.trendScore || '-'}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.tglInput || '-'}</td><td className="px-6 py-4 whitespace-nowrap text-sm font-medium"><button onClick={() => handleDeleteClick(entry)} className="text-red-600 hover:text-red-900 flex items-center"><Trash2 size={16} /></button></td></tr>)) : (<tr><td colSpan="6" className="px-6 py-10 text-center text-sm text-gray-500">Tidak ada data ditemukan.</td></tr>)}</tbody></table></div></div></div></>); };
const UploadCSVPage = ({ onProcessData }) => { const [file, setFile] = useState(null); const [isDragging, setIsDragging] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [parsedData, setParsedData] = useState([]); const handleFileChange = (e) => { const selectedFile = e.target.files[0]; if (selectedFile) { processFile(selectedFile); } }; const handleDragEvents = (e) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'dragenter' || e.type === 'dragover') { setIsDragging(true); } else if (e.type === 'dragleave') { setIsDragging(false); } }; const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const droppedFile = e.dataTransfer.files[0]; if (droppedFile) { processFile(droppedFile); } }; const processFile = (selectedFile) => { if (selectedFile.type !== 'text/csv') { setError('Format file tidak valid. Harap unggah file .csv'); setFile(null); setParsedData([]); setSuccess(''); return; } setFile(selectedFile); setError(''); setSuccess(''); setParsedData([]); const reader = new FileReader(); reader.onload = (event) => { try { const csvText = event.target.result; const lines = csvText.trim().split('\n'); const headers = lines[0].trim().split(','); if (headers[0].toLowerCase() !== 'produk' || headers[1].toLowerCase() !== 'kategori') { throw new Error("Format header CSV tidak sesuai. Harusnya: Produk,Kategori,Minggu1,Minggu2,..."); } const data = lines.slice(1).map((line, index) => { const values = line.trim().split(','); const history = headers.slice(2).map((header, i) => { const weekNumber = parseInt(header.replace(/minggu/i, '')); return { week: weekNumber, sales: parseInt(values[i + 2]) || 0, tglInput: new Date().toISOString().split('T')[0], trendScore: null }; }); return { id: `csv-p${index + 1}`, name: values[0], category: values[1], history: history, }; }); setParsedData(data); onProcessData(data); setSuccess(`File "${selectedFile.name}" berhasil diproses. ${data.length} produk diimpor.`); } catch (e) { setError(`Gagal memproses file: ${e.message}`); setFile(null); } }; reader.readAsText(selectedFile); }; return (<div className="p-8"><h1 className="text-3xl font-bold text-gray-800 mb-6">Upload Data Penjualan (CSV)</h1><div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-md space-y-6"><div><h2 className="text-xl font-bold text-gray-700">Format CSV</h2><p className="text-gray-600 mt-2">Pastikan file CSV Anda memiliki format header sebagai berikut. Data penjualan dimulai dari kolom ketiga.</p><div className="mt-3 p-3 bg-gray-100 rounded-md text-sm font-mono">Produk,Kategori,Minggu1,Minggu2,Minggu3,...</div></div><div className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors duration-200 ${isDragging ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400'}`} onDragEnter={handleDragEvents} onDragOver={handleDragEvents} onDragLeave={handleDragEvents} onDrop={handleDrop} onClick={() => document.getElementById('csv-input').click()}><input type="file" id="csv-input" accept=".csv" className="hidden" onChange={handleFileChange} /><FileUp className="mx-auto h-12 w-12 text-gray-400" /><p className="mt-2 text-sm text-gray-600"><span className="font-semibold text-green-600">Klik untuk mengunggah</span> atau seret dan lepas file CSV</p>{file && <p className="text-sm text-gray-500 mt-2">File terpilih: {file.name}</p>}</div>{error && (<div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-center" role="alert"><AlertTriangle className="mr-3" /><p>{error}</p></div>)}{success && (<div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md flex items-center" role="alert"><FileCheck2 className="mr-3" /><p>{success}</p></div>)}{parsedData.length > 0 && (<div><h3 className="text-lg font-bold text-gray-700 mb-4">Pratinjau Data</h3><div className="overflow-x-auto border rounded-lg"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produk</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategori</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Minggu Data</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{parsedData.map(item => (<tr key={item.id}><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.category}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.history.length}</td></tr>))}</tbody></table></div></div>)}</div></div>); };
const InputDataPage = ({ categories, onAddData }) => { const [week, setWeek] = useState(''); const [startDate, setStartDate] = useState(''); const [selectedCategory, setSelectedCategory] = useState(''); const [sales, setSales] = useState(''); const [trendScore, setTrendScore] = useState(''); const [error, setError] = useState({}); const [successMessage, setSuccessMessage] = useState(''); const resetForm = () => { setWeek(''); setStartDate(''); setSelectedCategory(''); setSales(''); setTrendScore(''); setError({}); }; const handleSubmit = (e) => { e.preventDefault(); const newError = {}; if (!week) newError.week = 'Minggu ke- harus diisi.'; if (!selectedCategory) newError.category = 'Kategori harus dipilih.'; if (!sales) newError.sales = 'Jumlah penjualan harus diisi.'; if (Object.keys(newError).length > 0) { setError(newError); setSuccessMessage(''); return; } onAddData({ week: parseInt(week), tglInput: startDate, category: selectedCategory, sales: parseInt(sales), trendScore: parseInt(trendScore) }); setSuccessMessage(`Data untuk kategori "${selectedCategory}" pada minggu ke-${week} berhasil disimpan!`); resetForm(); setTimeout(() => setSuccessMessage(''), 4000); }; return (<div className="p-8"><h1 className="text-3xl font-bold text-gray-800 mb-6">Input Data Penjualan Mingguan</h1><div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md"><form onSubmit={handleSubmit} className="space-y-6">{successMessage && (<div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md flex items-center" role="alert"><CheckCircle className="mr-3" /><p>{successMessage}</p></div>)}<div><label className="block text-sm font-medium text-gray-700 mb-1">Minggu ke-</label><input type="number" value={week} onChange={e => setWeek(e.target.value)} className={`w-full p-2 border rounded-md ${error.week ? 'border-red-500' : 'border-gray-300'}`} />{error.week && <p className="text-red-500 text-xs mt-1">{error.week}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Awal Minggu</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Kategori Hijab</label><select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className={`w-full p-2 border rounded-md ${error.category ? 'border-red-500' : 'border-gray-300'}`}><option value="">-- Pilih Kategori --</option>{categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select>{error.category && <p className="text-red-500 text-xs mt-1">{error.category}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Penjualan</label><input type="number" value={sales} onChange={e => setSales(e.target.value)} className={`w-full p-2 border rounded-md ${error.sales ? 'border-red-500' : 'border-gray-300'}`} />{error.sales && <p className="text-red-500 text-xs mt-1">{error.sales}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-1">Trend Score (0-100)</label><input type="number" min="0" max="100" value={trendScore} onChange={e => setTrendScore(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" /><p className="text-xs text-gray-500 mt-1">Karena API Google Trends memerlukan server, silakan masukkan nilai tren secara manual.</p></div><button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">Simpan Data</button></form></div></div>); };
const KelolaKategoriPage = ({ categories, onAddCategory, onDeleteCategory }) => { const [newCategoryName, setNewCategoryName] = useState(''); const [error, setError] = useState(''); const [isModalOpen, setIsModalOpen] = useState(false); const [categoryToDelete, setCategoryToDelete] = useState(null); const handleAddClick = () => { if (!newCategoryName.trim()) { setError('Nama kategori tidak boleh kosong.'); return; } if (categories.some(cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase())) { setError('Kategori sudah ada.'); return; } onAddCategory(newCategoryName); setNewCategoryName(''); setError(''); }; const handleDeleteClick = (category) => { setCategoryToDelete(category); setIsModalOpen(true); }; const confirmDelete = () => { onDeleteCategory(categoryToDelete.id); setIsModalOpen(false); setCategoryToDelete(null); }; return (<><ConfirmModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={confirmDelete} title="Konfirmasi Hapus Kategori"><p>Apakah Anda yakin ingin menghapus kategori <strong>"{categoryToDelete?.name}"</strong>?</p><p className="mt-2 text-sm text-yellow-600">Tindakan ini tidak dapat diurungkan.</p></ConfirmModal><div className="p-8"><h1 className="text-3xl font-bold text-gray-800 mb-6">Kelola Kategori</h1><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="md:col-span-1 bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Tambah Kategori Baru</h2><div className="space-y-4"><div><label htmlFor="categoryName" className="block text-sm font-medium text-gray-700">Nama Kategori</label><input type="text" id="categoryName" value={newCategoryName} onChange={(e) => { setNewCategoryName(e.target.value); setError(''); }} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" placeholder="e.g., Bergo, Instant" />{error && <p className="text-red-500 text-xs mt-1">{error}</p>}</div><button onClick={handleAddClick} className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"><PlusCircle size={18} className="mr-2" />Tambah Kategori</button></div></div><div className="md:col-span-2 bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Daftar Kategori Saat Ini</h2><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Kategori</th><th scope="col" className="relative px-6 py-3"><span className="sr-only">Aksi</span></th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{categories.length > 0 ? categories.map((cat) => (<tr key={cat.id} className="hover:bg-gray-50"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cat.name}</td><td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"><button onClick={() => handleDeleteClick(cat)} className="text-red-600 hover:text-red-900 flex items-center"><Trash2 size={16} className="mr-1" /> Hapus</button></td></tr>)) : (<tr><td colSpan="2" className="px-6 py-4 text-center text-sm text-gray-500">Belum ada kategori.</td></tr>)}</tbody></table></div></div></div></div></>); };
const PredictionPage = ({ products, categories, onAddReport }) => { const [selectedCategory, setSelectedCategory] = useState(''); const [parameterMode, setParameterMode] = useState('otomatis'); const [weightMode, setWeightMode] = useState('otomatis'); const [sesAlpha, setSesAlpha] = useState(0.5); const [holtAlpha, setHoltAlpha] = useState(0.5); const [holtBeta, setHoltBeta] = useState(0.5); const [weightSES, setWeightSES] = useState(0.4); const [weightHolt, setWeightHolt] = useState(0.3); const [weightLR, setWeightLR] = useState(0.3); const [autoParams, setAutoParams] = useState(null); const [autoWeights, setAutoWeights] = useState(null); const [predictions, setPredictions] = useState(null); const [isLoading, setIsLoading] = useState(false); const product = useMemo(() => products.find(p => p.category === selectedCategory), [selectedCategory, products]); const salesData = useMemo(() => product ? product.history.map(h => h.sales) : [], [product]); useEffect(() => { if (categories.length > 0 && !selectedCategory) { setSelectedCategory(categories[0].name); } }, [categories, selectedCategory]); const handlePredict = () => { if (!product) { alert("Pilih kategori yang valid terlebih dahulu."); return; } setIsLoading(true); setPredictions(null); setAutoParams(null); setAutoWeights(null); setTimeout(() => { let finalSesAlpha = sesAlpha; let finalHoltAlpha = holtAlpha; let finalHoltBeta = holtBeta; if (parameterMode === 'otomatis') { const bestSes = findBestSESParams(salesData); const bestHolt = findBestHoltParams(salesData); finalSesAlpha = bestSes.alpha; finalHoltAlpha = bestHolt.alpha; finalHoltBeta = bestHolt.beta; setAutoParams({ ses: bestSes, holt: bestHolt }); } const sesPred = getSESForecasts(salesData, finalSesAlpha).forecast; const holtPred = getHoltForecasts(salesData, finalHoltAlpha, finalHoltBeta).forecast; const lrPred = getLRForecasts(salesData).forecast; let finalWeightSES = weightSES; let finalWeightHolt = weightHolt; let finalWeightLR = weightLR; if (weightMode === 'otomatis') { const bestWeights = findBestWeights(salesData, {alpha: finalSesAlpha}, {alpha: finalHoltAlpha, beta: finalHoltBeta}); finalWeightSES = bestWeights.ses; finalWeightHolt = bestWeights.holt; finalWeightLR = bestWeights.lr; setAutoWeights(bestWeights); } const totalWeight = finalWeightSES + finalWeightHolt + finalWeightLR; const finalPrediction = (sesPred * finalWeightSES + holtPred * finalWeightHolt + lrPred * finalWeightLR) / totalWeight; const averageSales = salesData.reduce((a, b) => a + b, 0) / salesData.length; const trendStatus = finalPrediction > averageSales ? 'Laku' : 'Tidak Laku'; const predictionResult = { ses: sesPred.toFixed(2), holt: holtPred.toFixed(2), lr: lrPred.toFixed(2), final: finalPrediction.toFixed(2), status: trendStatus, average: averageSales.toFixed(2) }; setPredictions(predictionResult); onAddReport({ id: `rep-${Date.now()}`, category: product.category, week: product.history.length + 1, prediction: predictionResult.final, status: predictionResult.status }); setIsLoading(false); }, 1500); }; const chartData = product ? product.history.map(h => ({ ...h, 'Penjualan Aktual': h.sales })) : []; if (predictions && product) { chartData.push({ week: product.history.length + 1, 'Prediksi': parseFloat(predictions.final) }); } return (<div className="p-8 space-y-6"><h1 className="text-3xl font-bold text-gray-800">Prediksi Tren Produk</h1><div className="bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Lakukan Prediksi untuk Minggu Berikutnya</h2><div className="flex items-center gap-4"><select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setPredictions(null); }} className="w-full p-3 border rounded-md bg-gray-50"><option value="">-- Pilih Kategori --</option>{categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select><button onClick={handlePredict} disabled={isLoading || !selectedCategory} className="px-8 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed flex items-center gap-2">{isLoading ? <Loader2 className="animate-spin" /> : 'Prediksi'}</button></div></div>{isLoading && (<div className="flex justify-center items-center p-10 bg-white rounded-xl shadow-md"><Loader2 size={40} className="animate-spin text-purple-600" /><p className="ml-4 text-lg text-gray-600">Mencari parameter & bobot terbaik, lalu menghitung prediksi...</p></div>)}{predictions && (<div className="grid grid-cols-1 lg:grid-cols-5 gap-6"><div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Hasil Prediksi</h2><table className="min-w-full"><thead className="bg-gray-800 text-white"><tr><th className="px-4 py-2 text-left">Metode</th><th className="px-4 py-2 text-right">Hasil Prediksi (pcs)</th></tr></thead><tbody><tr className="border-b"><td className="px-4 py-2">Single Exponential Smoothing</td><td className="px-4 py-2 text-right font-mono">{predictions.ses}</td></tr><tr className="border-b"><td className="px-4 py-2">Holt's Linear Trend</td><td className="px-4 py-2 text-right font-mono">{predictions.holt}</td></tr><tr className="border-b"><td className="px-4 py-2">Linear Regression</td><td className="px-4 py-2 text-right font-mono">{predictions.lr}</td></tr><tr className="bg-gray-100 font-bold"><td className="px-4 py-2">Weighted Fusion (Final)</td><td className="px-4 py-2 text-right font-mono text-lg">{predictions.final}</td></tr></tbody></table><div className={`mt-4 p-4 rounded-lg text-white text-center ${predictions.status === 'Laku' ? 'bg-green-500' : 'bg-red-500'}`}><p className="font-bold text-xl">Status: {predictions.status}</p><p className="text-xs mt-1">(Dibandingkan rata-rata penjualan: {predictions.average})</p></div></div><div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Grafik Penjualan & Prediksi: {product?.name}</h2><ResponsiveContainer width="100%" height={300}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="Penjualan Aktual" stroke="#8884d8" activeDot={{ r: 8 }} /><Line type="monotone" dataKey="Prediksi" stroke="#ff7300" strokeDasharray="5 5" /></LineChart></ResponsiveContainer></div></div>)}{<div className="bg-white p-6 rounded-xl shadow-md"><h2 className="text-xl font-bold text-gray-700 mb-4">Konfigurasi Prediksi (Tingkat Lanjut)</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6"><div><label className="font-bold text-gray-700 block mb-2">Mode Parameter Model</label><div className="flex rounded-lg border p-1 bg-gray-100 w-min"><button onClick={() => setParameterMode('otomatis')} className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${parameterMode === 'otomatis' ? 'bg-white shadow' : 'bg-transparent text-gray-600'}`}><Zap size={16}/> Otomatis</button><button onClick={() => setParameterMode('manual')} className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${parameterMode === 'manual' ? 'bg-white shadow' : 'bg-transparent text-gray-600'}`}><SlidersHorizontal size={16}/> Manual</button></div>{autoParams && parameterMode === 'otomatis' && (<div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm"><p>Parameter optimal yang ditemukan:</p><ul className="list-disc list-inside mt-1"><li>SES Alpha (α): <strong>{autoParams.ses.alpha.toFixed(1)}</strong></li><li>Holt Alpha (α): <strong>{autoParams.holt.alpha.toFixed(1)}</strong>, Beta (β): <strong>{autoParams.holt.beta.toFixed(1)}</strong></li></ul></div>)}</div><div><label className="font-bold text-gray-700 block mb-2">Mode Bobot Fusion</label><div className="flex rounded-lg border p-1 bg-gray-100 w-min"><button onClick={() => setWeightMode('otomatis')} className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${weightMode === 'otomatis' ? 'bg-white shadow' : 'bg-transparent text-gray-600'}`}><Zap size={16}/> Otomatis</button><button onClick={() => setWeightMode('manual')} className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${weightMode === 'manual' ? 'bg-white shadow' : 'bg-transparent text-gray-600'}`}><SlidersHorizontal size={16}/> Manual</button></div>{autoWeights && weightMode === 'otomatis' && (<div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm"><p>Bobot optimal yang ditemukan:</p><ul className="list-disc list-inside mt-1"><li>Bobot SES: <strong>{(autoWeights.ses * 100).toFixed(1)}%</strong></li><li>Bobot Holt: <strong>{(autoWeights.holt * 100).toFixed(1)}%</strong></li><li>Bobot LR: <strong>{(autoWeights.lr * 100).toFixed(1)}%</strong></li></ul></div>)}</div><div className={`space-y-4 transition-opacity ${parameterMode === 'manual' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}><h3 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Parameter Model Manual</h3><p className="font-semibold">Single Exponential Smoothing</p><label>Alpha (α): {sesAlpha}</label><input type="range" min="0.1" max="0.9" step="0.1" value={sesAlpha} onChange={e => setSesAlpha(parseFloat(e.target.value))} className="w-full" disabled={parameterMode !== 'manual'} /><p className="font-semibold mt-4">Holt's Linear Trend</p><label>Alpha (α): {holtAlpha}</label><input type="range" min="0.1" max="0.9" step="0.1" value={holtAlpha} onChange={e => setHoltAlpha(parseFloat(e.target.value))} className="w-full" disabled={parameterMode !== 'manual'} /><label>Beta (β): {holtBeta}</label><input type="range" min="0.1" max="0.9" step="0.1" value={holtBeta} onChange={e => setHoltBeta(parseFloat(e.target.value))} className="w-full" disabled={parameterMode !== 'manual'} /></div><div className={`space-y-4 transition-opacity ${weightMode === 'manual' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}><h3 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Bobot Weighted Fusion Manual</h3><label>Bobot SES: {weightSES}</label><input type="range" min="0.1" max="1" step="0.1" value={weightSES} onChange={e => setWeightSES(parseFloat(e.target.value))} className="w-full" disabled={weightMode !== 'manual'} /><label>Bobot Holt: {weightHolt}</label><input type="range" min="0.1" max="1" step="0.1" value={weightHolt} onChange={e => setWeightHolt(parseFloat(e.target.value))} className="w-full" disabled={weightMode !== 'manual'} /><label>Bobot Lin. Reg: {weightLR}</label><input type="range" min="0.1" max="1" step="0.1" value={weightLR} onChange={e => setWeightLR(parseFloat(e.target.value))} className="w-full" disabled={weightMode !== 'manual'} /></div></div></div>}</div>); };
const LaporanPage = ({ reportData, onDeleteReport }) => { const [isModalOpen, setIsModalOpen] = useState(false); const [entryToDelete, setEntryToDelete] = useState(null); const handleDeleteClick = (entry) => { setEntryToDelete(entry); setIsModalOpen(true); }; const confirmDelete = () => { onDeleteReport(entryToDelete.id); setIsModalOpen(false); setEntryToDelete(null); }; const handlePrint = () => { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(18); doc.text("Laporan Hasil Prediksi", 14, 22); doc.autoTable({ startY: 30, head: [['Kategori', 'Minggu Ke', 'Hasil Prediksi (pcs)', 'Status']], body: reportData.map(item => [item.category, item.week, item.prediction, item.status]), headStyles: { fillColor: [41, 128, 185] }, theme: 'striped' }); doc.save('laporan-prediksi.pdf'); }; return (<><ConfirmModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={confirmDelete} title="Konfirmasi Hapus Laporan"><p>Apakah Anda yakin ingin menghapus laporan prediksi untuk <strong>{entryToDelete?.category}</strong> pada minggu ke-<strong>{entryToDelete?.week}</strong>?</p></ConfirmModal><div className="p-8"><div className="flex justify-between items-center mb-6"><h1 className="text-3xl font-bold text-gray-800">Laporan Hasil Prediksi</h1><button onClick={handlePrint} disabled={reportData.length === 0} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed flex items-center gap-2"><Printer size={16} /> Cetak</button></div><div className="bg-white p-6 rounded-xl shadow-md"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-800 text-white"><tr><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Kategori</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Minggu Ke</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Hasil Prediksi</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Aksi</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{reportData.length > 0 ? reportData.map((item) => (<tr key={item.id} className="hover:bg-gray-50"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.category}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.week}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.prediction} pcs</td><td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.status === 'Laku' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{item.status}</span></td><td className="px-6 py-4 whitespace-nowrap text-sm font-medium"><button onClick={() => handleDeleteClick(item)} className="text-red-600 hover:text-red-900"><Trash2 size={16} /></button></td></tr>)) : (<tr><td colSpan="5" className="px-6 py-10 text-center text-sm text-gray-500">Belum ada laporan prediksi.</td></tr>)}</tbody></table></div></div></div></>); };

const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    
    const [page, setPage] = useState('dashboard');
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConfigValid, setIsConfigValid] = useState(false);

    // Initialize Firebase and check config
    useEffect(() => {
        if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
            setIsConfigValid(true);
            try {
                const app = initializeApp(firebaseConfig);
                const firestoreDb = getFirestore(app);
                const firebaseAuth = getAuth(app);
                setDb(firestoreDb);
                setAuth(firebaseAuth);

                const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
                    setUser(currentUser);
                    setIsLoading(false);
                });
                
                // Load jsPDF scripts
                const scriptJsPDF = document.createElement('script');
                scriptJsPDF.src = 'https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js';
                scriptJsPDF.async = true;
                document.body.appendChild(scriptJsPDF);

                const scriptAutoTable = document.createElement('script');
                scriptAutoTable.src = 'https://unpkg.com/jspdf-autotable@3.5.23/dist/jspdf.plugin.autotable.js';
                scriptAutoTable.async = true;
                document.body.appendChild(scriptAutoTable);

                return () => {
                    unsubscribe();
                    document.body.removeChild(scriptJsPDF);
                    document.body.removeChild(scriptAutoTable);
                };
            } catch (error) {
                console.error("Firebase initialization error:", error);
                // If init fails (e.g., invalid config), treat as invalid.
                setIsConfigValid(false); 
                setIsLoading(false);
            }
        } else {
            setIsConfigValid(false);
            setIsLoading(false);
        }
    }, []);

    // Fetch Categories
    useEffect(() => {
        if (user && db) {
            const q = query(collection(db, "users", user.uid, "categories"), orderBy("name"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setCategories(cats);
            });
            return () => unsubscribe();
        }
    }, [db, user]);

    // Fetch Products
    useEffect(() => {
        if (user && db) {
            const q = query(collection(db, "users", user.uid, "products"), orderBy("name"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setProducts(prods);
            });
            return () => unsubscribe();
        }
    }, [db, user]);

    // Fetch Reports
    useEffect(() => {
        if (user && db) {
            const q = query(collection(db, "users", user.uid, "reports"), orderBy("createdAt", "desc"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const reps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setReportData(reps);
            });
            return () => unsubscribe();
        }
    }, [db, user]);

    const handleLogin = async () => { if (auth) { await signInAnonymously(auth); } };
    const handleLogout = async () => { if (auth) { await auth.signOut(); } };

    const handleAddCategory = async (categoryName) => { if (db && user) { await addDoc(collection(db, "users", user.uid, "categories"), { name: categoryName }); } };
    const handleDeleteCategory = async (categoryId) => { if (db && user) { await deleteDoc(doc(db, "users", user.uid, "categories", categoryId)); } };

    const handleAddData = async (newData) => {
        if (db && user) {
            const productsRef = collection(db, "users", user.uid, "products");
            const q = query(productsRef, where("category", "==", newData.category));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await addDoc(productsRef, { name: newData.category, category: newData.category, history: [newData] });
            } else {
                const productDoc = querySnapshot.docs[0];
                const productRef = doc(db, "users", user.uid, "products", productDoc.id);
                const currentHistory = productDoc.data().history || [];
                const existingWeekIndex = currentHistory.findIndex(h => h.week === newData.week);
                let updatedHistory;
                if (existingWeekIndex !== -1) {
                    updatedHistory = [...currentHistory];
                    updatedHistory[existingWeekIndex] = newData;
                } else {
                    updatedHistory = [...currentHistory, newData];
                }
                updatedHistory.sort((a, b) => a.week - b.week);
                await updateDoc(productRef, { history: updatedHistory });
            }
        }
    };
    
    const handleDeleteHistoryEntry = async (productId, weekToDelete) => {
        if (db && user) {
            const productRef = doc(db, "users", user.uid, "products", productId);
            const productDoc = await getDoc(productRef);
            if (productDoc.exists()) {
                const currentHistory = productDoc.data().history || [];
                const updatedHistory = currentHistory.filter(entry => entry.week !== weekToDelete);
                await updateDoc(productRef, { history: updatedHistory });
            }
        }
    };

    const handleCSVData = async (newProductsData) => {
        if (db && user) {
            const batch = writeBatch(db);
            const productsRef = collection(db, "users", user.uid, "products");
            const snapshot = await getDocs(productsRef);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            newProductsData.forEach(p => { const docRef = doc(productsRef); batch.set(docRef, { name: p.name, category: p.category, history: p.history }); });
            await batch.commit();
        }
    };

    const handleAddReport = async (newReport) => { if (db && user) { await addDoc(collection(db, "users", user.uid, "reports"), { ...newReport, createdAt: new Date() }); } };
    const handleDeleteReport = async (reportId) => { if (db && user) { await deleteDoc(doc(db, "users", user.uid, "reports", reportId)); } };

    if (!isConfigValid) {
        return <FirebaseSetupMessage />;
    }

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen"><Loader2 size={48} className="animate-spin text-green-600" /></div>;
    }

    if (!user) {
        return <LoginPage onLogin={handleLogin} />;
    }

    const renderPage = () => {
        switch (page) {
            case 'dashboard': return <DashboardPage products={products} />;
            case 'kelola-kategori': return <KelolaKategoriPage categories={categories} onAddCategory={handleAddCategory} onDeleteCategory={handleDeleteCategory} />;
            case 'input-data': return <InputDataPage categories={categories} onAddData={handleAddData} />;
            case 'upload-csv': return <UploadCSVPage onProcessData={handleCSVData} />;
            case 'prediksi': return <PredictionPage products={products} categories={categories} onAddReport={handleAddReport} />;
            case 'lihat-data': return <LihatDataPage products={products} categories={categories} onDeleteEntry={handleDeleteHistoryEntry} />;
            case 'laporan': return <LaporanPage reportData={reportData} onDeleteReport={handleDeleteReport} />;
            default: return <DashboardPage products={products} />;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <Sidebar activePage={page} setPage={setPage} onLogout={handleLogout} />
            <main className="flex-1 overflow-y-auto">{renderPage()}</main>
        </div>
    );
};

export default App;
