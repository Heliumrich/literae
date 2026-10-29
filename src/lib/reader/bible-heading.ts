import type { BibleTarget } from './bible-concordance';

/** Full Catholic book names for passage panels; the citation itself stays short. */
const titles: Record<string, string> = {
  GEN: 'Livre de la Genèse', EXO: 'Livre de l’Exode', LEV: 'Livre du Lévitique',
  NUM: 'Livre des Nombres', DEU: 'Livre du Deutéronome', JOS: 'Livre de Josué',
  JDG: 'Livre des Juges', RUT: 'Livre de Ruth',
  '1SA': 'Premier livre de Samuel', '2SA': 'Deuxième livre de Samuel',
  '1KI': 'Premier livre des Rois', '2KI': 'Deuxième livre des Rois',
  '1CH': 'Premier livre des Chroniques', '2CH': 'Deuxième livre des Chroniques',
  EZR: 'Livre d’Esdras', NEH: 'Livre de Néhémie', TOB: 'Livre de Tobie',
  JDT: 'Livre de Judith', EST: 'Livre d’Esther',
  '1MA': 'Premier livre des Maccabées', '2MA': 'Deuxième livre des Maccabées',
  JOB: 'Livre de Job', PSA: 'Livre des Psaumes', PRO: 'Livre des Proverbes',
  ECC: 'Livre de l’Ecclésiaste', SNG: 'Cantique des cantiques',
  WIS: 'Livre de la Sagesse', SIR: 'Livre de l’Ecclésiastique',
  ISA: 'Livre du prophète Isaïe', JER: 'Livre du prophète Jérémie',
  LAM: 'Lamentations de Jérémie', BAR: 'Livre de Baruch',
  EZK: 'Livre du prophète Ézéchiel', DAN: 'Livre du prophète Daniel',
  HOS: 'Livre du prophète Osée', JOL: 'Livre du prophète Joël',
  AMO: 'Livre du prophète Amos', OBA: 'Livre du prophète Abdias',
  JON: 'Livre du prophète Jonas', MIC: 'Livre du prophète Michée',
  NAM: 'Livre du prophète Nahum', HAB: 'Livre du prophète Habacuc',
  ZEP: 'Livre du prophète Sophonie', HAG: 'Livre du prophète Aggée',
  ZEC: 'Livre du prophète Zacharie', MAL: 'Livre du prophète Malachie',
  MAT: 'Évangile de saint Matthieu', MRK: 'Évangile de saint Marc',
  LUK: 'Évangile de saint Luc', JHN: 'Évangile de saint Jean', ACT: 'Actes des Apôtres',
  ROM: 'Épître de saint Paul aux Romains',
  '1CO': 'Première épître de saint Paul aux Corinthiens',
  '2CO': 'Deuxième épître de saint Paul aux Corinthiens',
  GAL: 'Épître de saint Paul aux Galates', EPH: 'Épître de saint Paul aux Éphésiens',
  PHP: 'Épître de saint Paul aux Philippiens', COL: 'Épître de saint Paul aux Colossiens',
  '1TH': 'Première épître de saint Paul aux Thessaloniciens',
  '2TH': 'Deuxième épître de saint Paul aux Thessaloniciens',
  '1TI': 'Première épître de saint Paul à Timothée',
  '2TI': 'Deuxième épître de saint Paul à Timothée',
  TIT: 'Épître de saint Paul à Tite', PHM: 'Épître de saint Paul à Philémon',
  HEB: 'Épître aux Hébreux', JAS: 'Épître de saint Jacques',
  '1PE': 'Première épître de saint Pierre', '2PE': 'Deuxième épître de saint Pierre',
  '1JN': 'Première épître de saint Jean', '2JN': 'Deuxième épître de saint Jean',
  '3JN': 'Troisième épître de saint Jean', JUD: 'Épître de saint Jude',
  REV: 'Apocalypse de saint Jean',
};

export const catholicBibleBookTitle = (code: string) => titles[code] || code;

const list = new Intl.ListFormat('fr', { type: 'conjunction' });

/** Describe the coordinates of the displayed text, after numbering concordance. */
export function biblePassageLocation(targets: BibleTarget[], whole: boolean): string {
  if (whole || targets.every(target => !target.ranges.length)) {
    const chapters = [...new Set(targets.map(target => String(target.chapter)))];
    return `${chapters.length === 1 ? 'Chapitre' : 'Chapitres'} ${list.format(chapters)}.`;
  }
  return targets.map((target, index) => {
    let label = `${index === 0 ? 'Chapitre' : 'chapitre'} ${target.chapter}`;
    if (target.ranges.length) {
      const single = target.ranges.length === 1 && target.ranges[0].first === target.ranges[0].last;
      const verses = target.ranges.map(range => range.first === range.last ? String(range.first) : `${range.first} à ${range.last}`);
      label += `, ${single ? 'verset' : 'versets'} ${list.format(verses)}`;
    }
    return label;
  }).join(' ; ') + '.';
}
