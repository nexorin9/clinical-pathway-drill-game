// Clinical Pathway Scenario Generator
// Generates randomized patient scenarios for the drill game

import { Scenario, VitalSigns, LabResult, ImagingResult } from './types';

/**
 * Difficulty level for scenario generation
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Gender option for patient scenarios
 */
export type Gender = 'male' | 'female';

/**
 * Randomization options for scenario generation
 */
export interface RandomizationOptions {
  /** Enable vital signs randomization within normal ranges */
  randomizeVitals: boolean;
  /** Enable lab result randomization with plausible variations */
  randomizeLabs: boolean;
  /** Enable demographic variation */
  randomizeDemographics: boolean;
}

/**
 * Default randomization options per difficulty
 */
const defaultOptions: Record<Difficulty, RandomizationOptions> = {
  easy: {
    randomizeVitals: false,
    randomizeLabs: false,
    randomizeDemographics: false,
  },
  medium: {
    randomizeVitals: true,
    randomizeLabs: true,
    randomizeDemographics: false,
  },
  hard: {
    randomizeVitals: true,
    randomizeLabs: true,
    randomizeDemographics: true,
  },
};

/**
 * Vital signs normal ranges for randomization
 */
const vitalRanges = {
  temperature: { min: 36.1, max: 37.2 },  // Celsius
  heartRate: { min: 60, max: 100 },        // bpm
  systolicBP: { min: 90, max: 140 },       // mmHg
  diastolicBP: { min: 60, max: 90 },        // mmHg
  respiratoryRate: { min: 12, max: 20 },    // breaths/min
  spo2: { min: 95, max: 100 },             // percentage
};

/**
 * Age ranges by difficulty
 */
const ageRanges: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 45, max: 65 },
  medium: { min: 25, max: 75 },
  hard: { min: 18, max: 85 },
};

/**
 * Common lab results with reference ranges
 */
const labDefinitions: Array<{
  name: string;
  unit: string;
  normalRange: { min: number; max: number };
  abnormalVariations: number[];
}> = [
  { name: 'WBC', unit: '×10⁹/L', normalRange: { min: 4, max: 10 }, abnormalVariations: [12, 15, 18, 25] },
  { name: 'Neutrophils', unit: '%', normalRange: { min: 40, max: 75 }, abnormalVariations: [80, 85, 90] },
  { name: 'CRP', unit: 'mg/L', normalRange: { min: 0, max: 10 }, abnormalVariations: [30, 50, 80, 120] },
  { name: 'PCT', unit: 'ng/mL', normalRange: { min: 0, max: 0.05 }, abnormalVariations: [2, 5, 10, 25] },
  { name: 'ALT', unit: 'U/L', normalRange: { min: 5, max: 40 }, abnormalVariations: [60, 100, 150] },
  { name: 'AST', unit: 'U/L', normalRange: { min: 5, max: 40 }, abnormalVariations: [50, 80, 120] },
  { name: 'Cr', unit: 'μmol/L', normalRange: { min: 44, max: 133 }, abnormalVariations: [200, 300, 450] },
  { name: 'BUN', unit: 'mmol/L', normalRange: { min: 2.6, max: 7.5 }, abnormalVariations: [10, 15, 20, 25] },
  { name: 'Na', unit: 'mmol/L', normalRange: { min: 135, max: 145 }, abnormalVariations: [128, 125, 150, 155] },
  { name: 'K', unit: 'mmol/L', normalRange: { min: 3.5, max: 5.3 }, abnormalVariations: [2.8, 3.0, 5.8, 6.5] },
  { name: 'Glucose', unit: 'mmol/L', normalRange: { min: 3.9, max: 6.1 }, abnormalVariations: [2.5, 8.0, 12, 18] },
];

/**
 * Generate a random number within a range
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer within a range (inclusive)
 */
function randomIntInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random gender
 */
function randomGender(): Gender {
  return Math.random() > 0.5 ? 'male' : 'female';
}

/**
 * Generate random patient name based on gender
 */
function generatePatientName(gender: Gender): string {
  const maleNames = ['张伟', '王芳', '李明', '赵强', '刘洋', '陈杰', '杨磊', '周杰'];
  const femaleNames = ['王秀英', '李娜', '张丽', '刘芳', '陈静', '杨敏', '周婷', '吴娟'];
  return randomPick(gender === 'male' ? maleNames : femaleNames);
}

/**
 * Generate random age based on difficulty
 */
function generateAge(difficulty: Difficulty): number {
  const range = ageRanges[difficulty];
  return randomIntInRange(range.min, range.max);
}

/**
 * Generate randomized vital signs
 */
function generateVitals(difficulty: Difficulty, isAbnormal: boolean): VitalSigns {
  const options = defaultOptions[difficulty];

  if (!options.randomizeVitals && !isAbnormal) {
    return {
      temperature: 36.8,
      heartRate: 78,
      bloodPressure: '120/80',
      respiratoryRate: 16,
      spo2: 98,
    };
  }

  if (isAbnormal) {
    // Generate slightly abnormal vitals
    return {
      temperature: randomInRange(37.5, 39.0),
      heartRate: randomIntInRange(90, 130),
      bloodPressure: `${randomIntInRange(140, 180)}/${randomIntInRange(90, 110)}`,
      respiratoryRate: randomIntInRange(22, 32),
      spo2: randomIntInRange(88, 94),
    };
  }

  // Normal variation
  return {
    temperature: randomInRange(vitalRanges.temperature.min, vitalRanges.temperature.max),
    heartRate: randomIntInRange(vitalRanges.heartRate.min, vitalRanges.heartRate.max),
    bloodPressure: `${randomIntInRange(vitalRanges.systolicBP.min, vitalRanges.systolicBP.max)}/${randomIntInRange(vitalRanges.diastolicBP.min, vitalRanges.diastolicBP.max)}`,
    respiratoryRate: randomIntInRange(vitalRanges.respiratoryRate.min, vitalRanges.respiratoryRate.max),
    spo2: randomIntInRange(vitalRanges.spo2.min, vitalRanges.spo2.max),
  };
}

/**
 * Generate lab results with randomization
 */
function generateLabResults(difficulty: Difficulty, isAbnormal: boolean): LabResult[] {
  const options = defaultOptions[difficulty];

  return labDefinitions.map((lab) => {
    let value: number;
    let isLabAbnormal = false;

    if (!options.randomizeLabs && !isAbnormal) {
      // Return normal values
      value = randomInRange(lab.normalRange.min, lab.normalRange.max);
      isLabAbnormal = false;
    } else if (isAbnormal) {
      // High probability of abnormal
      if (Math.random() > 0.3) {
        value = randomPick(lab.abnormalVariations);
        isLabAbnormal = true;
      } else {
        value = randomInRange(lab.normalRange.min, lab.normalRange.max);
        isLabAbnormal = false;
      }
    } else {
      // Medium difficulty: slight variation
      value = randomInRange(lab.normalRange.min * 0.8, lab.normalRange.max * 1.2);
      isLabAbnormal = value < lab.normalRange.min || value > lab.normalRange.max;
    }

    return {
      name: lab.name,
      value: Math.round(value * 100) / 100,
      unit: lab.unit,
      referenceRange: `${lab.normalRange.min}-${lab.normalRange.max}`,
      isAbnormal: isLabAbnormal,
    };
  });
}

/**
 * Generate imaging results
 */
function generateImagingResults(hasAbnormality: boolean): ImagingResult[] {
  if (!hasAbnormality) {
    return [
      { type: 'X-ray', finding: '未见明显异常' },
    ];
  }

  const findings = [
    { type: 'X-ray', finding: '右下肺野见片状模糊影，考虑炎症可能' },
    { type: 'CT', finding: '阑尾增粗，周围脂肪间隙模糊' },
    { type: '超声', finding: '胆囊壁增厚，胆囊结石' },
    { type: '心电图', finding: 'ST段弓背向上抬高' },
  ];

  return [randomPick(findings)];
}

/**
 * Scenario Generator class
 * Generates randomized patient scenarios for clinical pathway drills
 */
export class ScenarioGenerator {
  private scenarioCounter: number;

  constructor() {
    this.scenarioCounter = 0;
  }

  /**
   * Generate a unique scenario ID
   */
  private generateScenarioId(): string {
    this.scenarioCounter++;
    return `scenario_${Date.now()}_${this.scenarioCounter}`;
  }

  /**
   * Generate a scenario for a given pathway
   * @param pathId The clinical pathway ID
   * @param difficulty Difficulty level
   * @returns Generated scenario
   */
  generateScenario(pathId: string, difficulty: Difficulty = 'medium'): Scenario {
    const gender = randomGender();
    const age = generateAge(difficulty);
    const isAbnormal = difficulty !== 'easy' || Math.random() > 0.7;
    const hasImagingAbnormality = difficulty === 'hard' || (difficulty === 'medium' && Math.random() > 0.5);

    // Generate chief complaint based on pathway
    const chiefComplaint = this.generateChiefComplaint(pathId);

    const scenario: Scenario = {
      id: this.generateScenarioId(),
      name: `${gender === 'male' ? '男性' : '女性'}患者，${age}岁`,
      chiefComplaint,
      vitalSigns: generateVitals(difficulty, isAbnormal),
      labResults: generateLabResults(difficulty, isAbnormal),
      imagingResults: generateImagingResults(hasImagingAbnormality),
      pathId,
    };

    return scenario;
  }

  /**
   * Generate chief complaint based on pathway ID
   */
  private generateChiefComplaint(pathId: string): string {
    const complaints: Record<string, string[]> = {
      'acute_appendicitis': ['右下腹疼痛6小时', '转移性右下腹痛4小时', '腹痛伴恶心呕吐4小时'],
      'cap': ['发热、咳嗽咳痰3天', '咳嗽发热2天', '咽痛伴发热2天'],
      'stemi': ['持续胸痛2小时', '胸闷气短1小时', '胸骨后压榨样疼痛2小时'],
    };

    const pathwayComplaints = complaints[pathId] || ['不明原因不适'];
    return randomPick(pathwayComplaints);
  }

  /**
   * Randomize findings within a scenario
   * @param scenario Original scenario
   * @returns New scenario with randomized values
   */
  randomizeFindings(scenario: Scenario): Scenario {
    const newScenario = { ...scenario, id: this.generateScenarioId() };

    // Randomize vitals
    newScenario.vitalSigns = {
      temperature: randomInRange(vitalRanges.temperature.min, vitalRanges.temperature.max),
      heartRate: randomIntInRange(vitalRanges.heartRate.min, vitalRanges.heartRate.max),
      bloodPressure: `${randomIntInRange(vitalRanges.systolicBP.min, vitalRanges.systolicBP.max)}/${randomIntInRange(vitalRanges.diastolicBP.min, vitalRanges.diastolicBP.max)}`,
      respiratoryRate: randomIntInRange(vitalRanges.respiratoryRate.min, vitalRanges.respiratoryRate.max),
      spo2: randomIntInRange(vitalRanges.spo2.min, vitalRanges.spo2.max),
    };

    // Randomize lab results
    newScenario.labResults = scenario.labResults.map((lab) => {
      // Parse reference range to get variation
      const refMatch = lab.referenceRange?.match(/(\d+\.?\d*)-(\d+\.?\d*)/);
      let variation = 1;
      if (refMatch) {
        const min = parseFloat(refMatch[1]);
        const max = parseFloat(refMatch[2]);
        variation = (max - min) * 0.2;
      }
      const baseValue = parseFloat(String(lab.value));
      const newValue = baseValue + (Math.random() - 0.5) * variation * 2;
      const isHigh = newValue > parseFloat(String(lab.referenceRange?.split('-')[1] || '999'));
      const isLow = newValue < parseFloat(String(lab.referenceRange?.split('-')[0] || '0'));
      return {
        ...lab,
        value: Math.round(newValue * 100) / 100,
        isAbnormal: isHigh || isLow,
      };
    });

    return newScenario;
  }

  /**
   * Serialize scenario to CLI display format
   * @param scenario Scenario to serialize
   * @returns Formatted string for CLI display
   */
  serializeScenario(scenario: Scenario): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════');
    lines.push(`【患者信息】${scenario.name}`);
    lines.push('═══════════════════════════════════════════');
    lines.push('');
    lines.push(`主诉：${scenario.chiefComplaint}`);
    lines.push('');
    lines.push('【生命体征】');
    const vitals = scenario.vitalSigns;
    lines.push(`  体温: ${vitals.temperature?.toFixed(1)}°C`);
    lines.push(`  心率: ${vitals.heartRate} 次/分`);
    lines.push(`  血压: ${vitals.bloodPressure} mmHg`);
    lines.push(`  呼吸: ${vitals.respiratoryRate} 次/分`);
    lines.push(`  SpO₂: ${vitals.spo2}%`);
    lines.push('');
    lines.push('【检验结果】');
    for (const lab of scenario.labResults) {
      const abnormal = lab.isAbnormal ? ' ⚠️' : '';
      lines.push(`  ${lab.name}: ${lab.value} ${lab.unit} (参考: ${lab.referenceRange})${abnormal}`);
    }
    lines.push('');

    if (scenario.imagingResults && scenario.imagingResults.length > 0) {
      lines.push('【影像学】');
      for (const img of scenario.imagingResults) {
        lines.push(`  ${img.type}: ${img.finding}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════');

    return lines.join('\n');
  }
}

// Export singleton instance
export const scenarioGenerator = new ScenarioGenerator();

// Export factory function for convenience
export function generateScenario(pathId: string, difficulty: Difficulty = 'medium'): Scenario {
  return scenarioGenerator.generateScenario(pathId, difficulty);
}

export function randomizeFindings(scenario: Scenario): Scenario {
  return scenarioGenerator.randomizeFindings(scenario);
}

export function serializeScenario(scenario: Scenario): string {
  return scenarioGenerator.serializeScenario(scenario);
}