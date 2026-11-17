import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ALL_DAYS, DAY_LABELS, ScheduleEntry, ShiftId, SystemSettings, WeeklySchedule } from '../types/domain';
import { formatDateTimeBR, formatWeekRangeBR, getWeekDayDates } from './dateUtils';

export type PdfExportScope = 'all' | ShiftId;

export function exportWeeklyScheduleToPdf(
  schedule: WeeklySchedule,
  settings: SystemSettings,
  scope: PdfExportScope = 'all'
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const weekDates = getWeekDayDates(schedule.weekStart);

  // Header band
  doc.setFillColor(21, 128, 61); // Emerald/Green-700
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.companyName.toUpperCase(), 14, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const scopeLabel =
    scope === 'all' ? 'Escala Completa (Turnos 01 e 02)' : `Somente Turno ${scope}`;
  doc.text(`ESCALA SEMANAL DE TRABALHO — REGIME 5X2  |  ${scopeLabel}`, 14, 17);

  doc.setFontSize(9.5);
  doc.text(`Semana de referência: ${formatWeekRangeBR(schedule.weekStart, schedule.weekEnd)}`, pageWidth - 14, 10, {
    align: 'right',
  });
  doc.text(`Versão #${schedule.version}`, pageWidth - 14, 17, { align: 'right' });

  // Supervisors & Shift hours summary
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);

  const shiftsToRender: ShiftId[] = scope === 'all' ? ['01', '02'] : [scope];
  let currentY = 30;

  doc.setFont('helvetica', 'bold');
  doc.text('Responsáveis e Horários:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  currentY += 4.5;

  const infoLines: string[] = [];
  if (shiftsToRender.includes('01')) {
    const s1 = settings.shifts['01'];
    infoLines.push(
      `Turno 01 · Encarregado: ${schedule.supervisorShift01 || 'Não definido'} · Seg–Sex: ${s1.weekdayHours.start} às ${s1.weekdayHours.end} · Sáb: ${s1.saturdayHours.start} às ${s1.saturdayHours.end} · Dom: DSR`
    );
  }
  if (shiftsToRender.includes('02')) {
    const s2 = settings.shifts['02'];
    infoLines.push(
      `Turno 02 · Encarregada: ${schedule.supervisorShift02 || 'Não definida'} · Seg–Sex: ${s2.weekdayHours.start} às ${s2.weekdayHours.end} · Sáb: ${s2.saturdayHours.start} às ${s2.saturdayHours.end} · Dom: DSR`
    );
  }

  for (const line of infoLines) {
    doc.text(line, 14, currentY);
    currentY += 4.5;
  }

  currentY += 2;

  const buildRowsForEntries = (entries: ScheduleEntry[]) =>
    [...entries]
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'pt-BR'))
      .map((entry) => [
        entry.employeeName,
        entry.employeeRole,
        `T${entry.shift}`,
        `${entry.weekdayHours.start}-${entry.weekdayHours.end}\nSáb ${entry.saturdayHours.start}-${entry.saturdayHours.end}`,
        ...ALL_DAYS.map((d) => entry.days[d]),
        `${DAY_LABELS[entry.offDay].short} + Dom`,
      ]);

  const headRow = [
    'Funcionário',
    'Função',
    'Turno',
    'Horário',
    ...ALL_DAYS.map((d) => `${DAY_LABELS[d].short}\n${weekDates[d].shortBR}`),
    'Folgas',
  ];

  for (const shiftId of shiftsToRender) {
    const shiftEntries = schedule.entries.filter((e) => e.shift === shiftId);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(21, 128, 61);
    const supervisor = shiftId === '01' ? schedule.supervisorShift01 : schedule.supervisorShift02;
    doc.text(
      `TURNO ${shiftId} — Encarregado(a): ${supervisor || 'Não definido'} (${shiftEntries.length} funcionário${shiftEntries.length === 1 ? '' : 's'})`,
      14,
      currentY
    );
    currentY += 2.5;

    if (shiftEntries.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Nenhum funcionário escalado neste turno para esta semana.', 14, currentY + 4);
      currentY += 10;
      continue;
    }

    autoTable(doc, {
      startY: currentY,
      head: [headRow],
      body: buildRowsForEntries(shiftEntries),
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 42, fontStyle: 'bold' },
        1: { halign: 'left', cellWidth: 28 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 30, fontSize: 6.8 },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
        9: { halign: 'center' },
        10: { halign: 'center' },
        11: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index >= 4 && data.column.index <= 10) {
          const val = String(data.cell.raw);
          if (val === 'TRABALHO') {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [22, 101, 52];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'FOLGA') {
            data.cell.styles.fillColor = [255, 237, 213];
            data.cell.styles.textColor = [154, 52, 18];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'DSR') {
            data.cell.styles.fillColor = [241, 245, 249];
            data.cell.styles.textColor = [51, 65, 85];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? currentY + 20;
    currentY = finalY + 8;
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  const generatedLabel = `Documento gerado em ${formatDateTimeBR(new Date().toISOString())} · Escala confirmada em ${formatDateTimeBR(schedule.confirmedAt)}`;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${settings.companyName} — Regime 5x2 (Folga rotativa Seg–Sáb / Domingo DSR fixo)`, 14, pageHeight - 7);
    doc.text(`${generatedLabel}  |  Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 7, {
      align: 'right',
    });
  }

  const fileScope = scope === 'all' ? 'completa' : `turno-${scope}`;
  doc.save(`escala-casagrande-${schedule.weekStart}-${fileScope}.pdf`);
}
