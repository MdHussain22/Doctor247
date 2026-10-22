import { useEffect, useState } from 'react';
import { api, when } from '../api';
import { toast } from '../ui.jsx';

const MAX_BYTES = 4 * 1024 * 1024;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(fileName, mimeType, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName || 'report';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function AppointmentRecords({ appointment, role }) {
  const [records, setRecords] = useState([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [instructions, setInstructions] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');

  const load = () => api(`/medical-records/${appointment.id}/records`).then(setRecords).catch((e) => toast(e.message));
  useEffect(() => { load(); }, [appointment.id]);

  async function uploadReport(e) {
    e.preventDefault();
    if (!file) return toast('Choose a PDF or image first.');
    if (file.size > MAX_BYTES) return toast('File must be 4 MB or smaller.');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Use a PDF, JPG, PNG or WebP file.');
    setBusy(true);
    try {
      const fileData = await readFile(file);
      await api(`/medical-records/${appointment.id}/reports`, { method: 'POST', body: { title: title.trim() || file.name, fileName: file.name, mimeType: file.type, fileData } });
      setTitle(''); setFile(null); e.target.reset();
      toast('Report uploaded securely to this appointment.');
      await load();
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  async function issuePrescription(e) {
    e.preventDefault();
    if (!diagnosis.trim()) return toast('Add a diagnosis or clinical impression.');
    const medicines = medicine.trim() ? [{ name: medicine.trim(), dose, frequency, duration, instructions }] : [];
    setBusy(true);
    try {
      await api(`/medical-records/${appointment.id}/prescriptions`, { method: 'POST', body: { diagnosis, medicines, advice, followUp } });
      setDiagnosis(''); setMedicine(''); setDose(''); setFrequency(''); setDuration(''); setInstructions(''); setAdvice(''); setFollowUp('');
      toast('Prescription issued.');
      await load();
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  async function downloadReport(record) {
    try {
      const result = await api(`/medical-records/${appointment.id}/records/${record.id}/download`);
      downloadDataUrl(result.fileName, result.mimeType, result.fileData);
    } catch (e) { toast(e.message); }
  }

  return (
    <section className="appointment-records">
      <h4>Medical records</h4>
      {records.length === 0 && <p className="m">No reports or prescriptions attached yet.</p>}
      {records.map((record) => (
        <div className="record-item" key={record.id}>
          <div className="row">
            <div><b>{record.type === 'REPORT' ? '📎 ' : '✚ '}{record.title}</b><p className="m">{when(record.createdAt)}</p></div>
            {record.type === 'REPORT' && <button type="button" onClick={() => downloadReport(record)}>Download</button>}
          </div>
          {record.type === 'PRESCRIPTION' && record.details && (
            <div className="prescription-details">
              <p><b>Diagnosis:</b> {record.details.diagnosis}</p>
              {record.details.medicines?.map((m, i) => <div key={i}><b>{m.name}</b>{m.dose && ` — ${m.dose}`}{m.frequency && ` · ${m.frequency}`}{m.duration && ` · ${m.duration}`}{m.instructions && <p className="m">{m.instructions}</p>}</div>)}
              {record.details.advice && <p><b>Advice:</b> {record.details.advice}</p>}
              {record.details.followUp && <p><b>Follow-up:</b> {record.details.followUp}</p>}
              <button type="button" onClick={() => window.print()}>Print prescription</button>
            </div>
          )}
        </div>
      ))}

      {role === 'PATIENT' && (
        <form className="record-form" onSubmit={uploadReport}>
          <h4>Upload a report</h4>
          <p className="m">Share lab reports or images with the doctor for this appointment. PDF, JPG, PNG or WebP; up to 4 MB.</p>
          <label>Report title (optional)<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Blood test results" /></label>
          <label>Choose file<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <button className="p" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload report'}</button>
        </form>
      )}

      {role === 'DOCTOR' && ['IN_PROGRESS', 'COMPLETED'].includes(appointment.status) && (
        <form className="record-form" onSubmit={issuePrescription}>
          <h4>Issue digital prescription</h4>
          <label>Diagnosis / clinical impression<input required value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} maxLength={500} /></label>
          <div className="g">
            <label>Medicine name (optional)<input value={medicine} onChange={(e) => setMedicine(e.target.value)} maxLength={160} /></label>
            <label>Dose<input value={dose} onChange={(e) => setDose(e.target.value)} maxLength={120} placeholder="e.g. 1 tablet" /></label>
            <label>Frequency<input value={frequency} onChange={(e) => setFrequency(e.target.value)} maxLength={120} placeholder="e.g. twice daily" /></label>
            <label>Duration<input value={duration} onChange={(e) => setDuration(e.target.value)} maxLength={120} placeholder="e.g. 5 days" /></label>
          </div>
          <label>Medicine instructions<input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={300} /></label>
          <label>Advice<textarea rows="2" value={advice} onChange={(e) => setAdvice(e.target.value)} maxLength={2000} /></label>
          <label>Follow-up<input value={followUp} onChange={(e) => setFollowUp(e.target.value)} maxLength={200} placeholder="e.g. Review in 7 days" /></label>
          <button className="p" disabled={busy}>{busy ? 'Saving…' : 'Issue prescription'}</button>
          <p className="m">Review all details before issuing. Prescriptions must comply with applicable telemedicine and prescribing rules.</p>
        </form>
      )}
    </section>
  );
}
