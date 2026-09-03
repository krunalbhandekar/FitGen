/**
 * PDF export for workout and diet plans.
 *
 * Generated client-side, so no server round-trip and no file storage. The
 * documents are deliberately print-oriented: black on white, no brand colour
 * fills, no images. A plan is something people take to a gym or a supermarket,
 * often printed on a mono printer, and a dark-themed PDF would waste ink and
 * read badly.
 *
 * jsPDF and its optional dependencies are ~380 kB, which is more than the rest
 * of the app put together, and most visits never export anything — so it is
 * imported on the first click rather than at load. That makes the three export
 * functions async; callers must handle a rejection, because a chunk fetch can
 * fail on a bad connection.
 */

let jsPDF = null;

const loadJsPdf = async () => {
  if (!jsPDF) ({ jsPDF } = await import('jspdf'));
  return jsPDF;
};

const PAGE = { width: 210, height: 297 }; // A4 portrait, millimetres
const MARGIN = 16;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = { dark: 20, mid: 90, light: 140, rule: 210 };

const fmtDate = (value = new Date()) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const humanise = (value = '') =>
  String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Small layout helper.
 *
 * jsPDF has no flow layout — you place text at coordinates — so this tracks a
 * cursor and handles the page break, which is the part that otherwise silently
 * writes text off the bottom of the page.
 */
class Doc {
  constructor(title, JsPdf) {
    this.pdf = new JsPdf({ unit: 'mm', format: 'a4' });
    this.y = MARGIN;
    this.title = title;
    this.pageNumber = 1;
  }

  /** Ensures `needed` mm remain; starts a new page otherwise. */
  space(needed) {
    if (this.y + needed > PAGE.height - MARGIN - 8) {
      this.footer();
      this.pdf.addPage();
      this.pageNumber += 1;
      this.y = MARGIN;
      return true;
    }
    return false;
  }

  heading(text, size = 20) {
    this.space(size / 2 + 6);
    this.pdf.setFont('helvetica', 'bold').setFontSize(size).setTextColor(INK.dark);
    this.pdf.text(text, MARGIN, this.y);
    this.y += size / 2 + 2;
  }

  subheading(text) {
    this.space(10);
    this.pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK.dark);
    this.pdf.text(text, MARGIN, this.y);
    this.y += 5.5;
  }

  body(text, { size = 9.5, colour = INK.mid, gap = 4.6 } = {}) {
    this.pdf.setFont('helvetica', 'normal').setFontSize(size).setTextColor(colour);
    const lines = this.pdf.splitTextToSize(text, CONTENT_WIDTH);
    for (const line of lines) {
      this.space(gap);
      this.pdf.text(line, MARGIN, this.y);
      this.y += gap;
    }
  }

  rule(gapAfter = 4) {
    this.space(gapAfter + 1);
    this.pdf.setDrawColor(INK.rule).setLineWidth(0.2);
    this.pdf.line(MARGIN, this.y, PAGE.width - MARGIN, this.y);
    this.y += gapAfter;
  }

  /** Simple column table. `widths` are millimetres and must sum ≤ CONTENT_WIDTH. */
  table({ columns, widths, rows, zebra = true }) {
    const ROW = 6.2;

    const header = () => {
      this.pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(INK.dark);
      let x = MARGIN;
      columns.forEach((col, i) => {
        this.pdf.text(String(col), x, this.y);
        x += widths[i];
      });
      this.y += 2;
      this.pdf.setDrawColor(INK.light).setLineWidth(0.3);
      this.pdf.line(MARGIN, this.y, PAGE.width - MARGIN, this.y);
      this.y += 4;
    };

    this.space(ROW * 2);
    header();

    rows.forEach((row, index) => {
      // Repeat the header when a table spans a page.
      if (this.space(ROW)) header();

      if (zebra && index % 2 === 1) {
        this.pdf.setFillColor(246);
        this.pdf.rect(MARGIN - 1.5, this.y - 4, CONTENT_WIDTH + 3, ROW, 'F');
      }

      this.pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(INK.dark);
      let x = MARGIN;
      row.forEach((cell, i) => {
        const text = this.pdf.splitTextToSize(String(cell ?? ''), widths[i] - 2)[0] ?? '';
        this.pdf.text(text, x, this.y);
        x += widths[i];
      });
      this.y += ROW;
    });

    this.y += 2;
  }

  footer() {
    this.pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(INK.light);
    this.pdf.text(
      `FitGen · ${this.title}`,
      MARGIN,
      PAGE.height - 10,
    );
    this.pdf.text(
      `Page ${this.pageNumber}`,
      PAGE.width - MARGIN,
      PAGE.height - 10,
      { align: 'right' },
    );
  }

  save(filename) {
    this.footer();
    this.pdf.save(filename);
  }
}

/** Shared masthead. */
const masthead = (doc, { title, subtitle, meta }) => {
  doc.pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(INK.light);
  doc.pdf.text('FITGEN', MARGIN, doc.y);
  doc.y += 7;

  doc.heading(title, 22);
  if (subtitle) doc.body(subtitle, { size: 10, colour: INK.mid, gap: 5 });

  if (meta?.length) {
    doc.y += 1;
    doc.pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(INK.light);
    doc.pdf.text(meta.join('   ·   '), MARGIN, doc.y);
    doc.y += 4;
  }
  doc.rule(6);
};

const slugifyName = (name = 'user') =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user';

/* ------------------------------------------------------------ workout plan */

export const exportWorkoutPlanPdf = async (plan, { userName } = {}) => {
  const doc = new Doc('Workout plan', await loadJsPdf());

  masthead(doc, {
    title: 'Workout Plan',
    subtitle: `${humanise(plan.splitType)} · ${plan.daysPerWeek} days per week · Goal: ${humanise(plan.goal)}`,
    meta: [
      `Version ${plan.version}`,
      `Generated ${fmtDate(plan.createdAt)}`,
      plan.generation?.generatedBy === 'fallback' ? 'Rule-based' : 'AI generated',
    ],
  });

  if (plan.guidelines) {
    doc.body(
      `Prescribed volume: ${plan.guidelines.sets} sets of ${plan.guidelines.reps}, resting about ${plan.guidelines.restSeconds} seconds between sets.`,
      { size: 9.5 },
    );
    doc.y += 2;
  }

  for (const day of plan.days) {
    doc.space(30);
    doc.subheading(`Day ${day.dayIndex} — ${day.name}`);
    doc.body(day.description ?? '', { size: 8.5, colour: INK.light, gap: 4.2 });

    if (day.exercises.length === 0) {
      doc.body('Active recovery — walking, mobility work or physiotherapy.', {
        size: 9,
      });
      doc.y += 3;
      continue;
    }

    doc.table({
      columns: ['#', 'Exercise', 'Sets', 'Reps', 'Rest', 'Load'],
      widths: [8, 84, 14, 20, 18, 34],
      rows: day.exercises.map((exercise) => [
        exercise.order,
        exercise.name,
        exercise.sets,
        exercise.reps,
        `${exercise.restSeconds}s`,
        // Left blank on purpose: this is a printable log sheet.
        '__________',
      ]),
    });

    const cautions = day.exercises.filter((e) => e.caution);
    if (cautions.length) {
      doc.body(
        `Caution: ${cautions.map((e) => `${e.name} — ${e.caution}`).join(' ')}`,
        { size: 8, colour: INK.mid, gap: 4 },
      );
    }
    doc.y += 3;
  }

  if (plan.safetyNotes?.length) {
    doc.rule(5);
    doc.subheading('Injury filtering applied');
    for (const note of plan.safetyNotes) {
      doc.body(`• ${note}`, { size: 8.5, colour: INK.mid, gap: 4.2 });
    }
  }

  doc.rule(5);
  doc.body(
    'Exercises are selected from a verified database and filtered to the equipment and injuries recorded on your profile. FitGen does not provide medical advice.',
    { size: 7.5, colour: INK.light, gap: 3.6 },
  );

  doc.save(`fitgen-workout-${slugifyName(userName)}-v${plan.version}.pdf`);
};

/* --------------------------------------------------------------- diet plan */

export const exportDietPlanPdf = async (plan, { userName } = {}) => {
  const doc = new Doc('Diet plan', await loadJsPdf());

  masthead(doc, {
    title: 'Diet Plan',
    subtitle: [
      plan.dailyTotals?.calories != null && `${plan.dailyTotals.calories} kcal per day`,
      `${plan.meals?.length ?? 0} meals`,
    ]
      .filter(Boolean)
      .join(' · '),
    meta: [
      `Version ${plan.version}`,
      `Generated ${fmtDate(plan.createdAt)}`,
      plan.generation?.generatedBy === 'fallback' ? 'Rule-based' : 'AI generated',
    ],
  });

  /*
   * `targets` and `variance` have no schema default, so a stored plan can be
   * missing either one. Each row is therefore included only when its source is
   * present: one absent figure must not take the whole document down, since the
   * meal tables below are the part the user actually needs.
   */
  const macroRow = (label, macros, signed = false) => {
    if (!macros) return null;
    const cell = (value, unit) => {
      if (value == null) return '—';
      return `${signed && value > 0 ? '+' : ''}${value} ${unit}`;
    };
    return [
      label,
      cell(macros.calories, 'kcal'),
      cell(macros.protein, 'g'),
      cell(macros.carbs, 'g'),
      cell(macros.fats, 'g'),
    ];
  };

  const macroRows = [
    macroRow('Target', plan.targets),
    macroRow('This plan', plan.dailyTotals),
    macroRow('Difference', plan.variance, true),
  ].filter(Boolean);

  if (macroRows.length) {
    doc.subheading('Daily targets and actuals');
    doc.table({
      columns: ['', 'Calories', 'Protein', 'Carbs', 'Fats'],
      widths: [34, 34, 34, 34, 32],
      rows: macroRows,
      zebra: false,
    });
  }

  for (const meal of plan.meals ?? []) {
    doc.space(34);
    const totals = meal.totals;
    doc.subheading(
      totals
        ? `${meal.name} — ${totals.calories} kcal (P${totals.protein} / C${totals.carbs} / F${totals.fats})`
        : meal.name,
    );

    doc.table({
      columns: ['Food', 'Amount', 'Calories', 'P', 'C', 'F'],
      widths: [74, 26, 26, 16, 16, 20],
      rows: (meal.items ?? []).map((item) => [
        item.name,
        `${item.grams}${item.unit}`,
        item.calories,
        item.protein,
        item.carbs,
        item.fats,
      ]),
    });
    doc.y += 2;
  }

  doc.rule(5);
  doc.body(
    'Foods are selected from a verified nutrition database; every macro figure is computed from the recorded portion, not estimated. Values are per 100 g or 100 ml as published, and cooking method will shift them. FitGen does not provide medical or dietetic advice.',
    { size: 7.5, colour: INK.light, gap: 3.6 },
  );

  doc.save(`fitgen-diet-${slugifyName(userName)}-v${plan.version}.pdf`);
};

/* ------------------------------------------------------------ grocery list */

export const exportGroceryListPdf = async (list, { userName } = {}) => {
  const doc = new Doc('Grocery list', await loadJsPdf());

  masthead(doc, {
    title: 'Grocery List',
    subtitle: `${list.days} day${list.days === 1 ? '' : 's'} of food · ${list.summary.distinctItems} items`,
    meta: [
      `About ${list.summary.caloriesPerDay} kcal per day`,
      `Generated ${fmtDate()}`,
    ],
  });

  for (const group of list.groups) {
    doc.space(24);
    doc.subheading(group.aisle);

    for (const item of group.items) {
      doc.space(6.4);
      // Tick box, drawn rather than typed so it survives any font.
      doc.pdf.setDrawColor(INK.light).setLineWidth(0.3);
      doc.pdf.rect(MARGIN, doc.y - 3.2, 3.4, 3.4);

      doc.pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(INK.dark);
      doc.pdf.text(item.name, MARGIN + 6, doc.y);

      doc.pdf.setFont('helvetica', 'bold').setFontSize(9.5);
      doc.pdf.text(
        `${item.purchase.amount}${item.purchase.unit}`,
        PAGE.width - MARGIN,
        doc.y,
        { align: 'right' },
      );
      doc.y += 6.4;
    }
    doc.y += 2;
  }

  doc.rule(5);
  doc.body(
    'Quantities are rounded up to practical shopping amounts, so they exceed the exact requirement slightly.',
    { size: 7.5, colour: INK.light, gap: 3.6 },
  );

  doc.save(`fitgen-groceries-${slugifyName(userName)}-${list.days}d.pdf`);
};
