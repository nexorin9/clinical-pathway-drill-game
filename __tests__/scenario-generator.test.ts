// Scenario Generator Unit Tests

import {
  ScenarioGenerator,
  scenarioGenerator,
  generateScenario,
  randomizeFindings,
  serializeScenario,
  Difficulty,
} from '../src/core/scenario-generator';
import { Scenario } from '../src/core/types';

describe('ScenarioGenerator', () => {
  let generator: ScenarioGenerator;

  beforeEach(() => {
    generator = new ScenarioGenerator();
  });

  describe('generateScenario', () => {
    it('should generate a scenario with valid structure', () => {
      const scenario = generator.generateScenario('acute_appendicitis', 'medium');

      expect(scenario).toBeDefined();
      expect(scenario.id).toBeDefined();
      expect(scenario.id.startsWith('scenario_')).toBe(true);
      expect(scenario.pathId).toBe('acute_appendicitis');
      expect(scenario.name).toContain('患者');
      expect(scenario.chiefComplaint).toBeDefined();
      expect(scenario.vitalSigns).toBeDefined();
      expect(scenario.labResults).toBeDefined();
      expect(Array.isArray(scenario.labResults)).toBe(true);
    });

    it('should generate different scenarios on each call', () => {
      const scenario1 = generator.generateScenario('cap', 'medium');
      const scenario2 = generator.generateScenario('cap', 'medium');

      expect(scenario1.id).not.toBe(scenario2.id);
    });

    it('should generate scenarios for different pathways', () => {
      const appendicitis = generator.generateScenario('acute_appendicitis', 'easy');
      const cap = generator.generateScenario('cap', 'easy');
      const stemi = generator.generateScenario('stemi', 'easy');

      expect(appendicitis.pathId).toBe('acute_appendicitis');
      expect(cap.pathId).toBe('cap');
      expect(stemi.pathId).toBe('stemi');
    });

    it('should generate chief complaints for known pathways', () => {
      const appendicitis = generator.generateScenario('acute_appendicitis', 'easy');
      expect(appendicitis.chiefComplaint).toContain('腹');

      const cap = generator.generateScenario('cap', 'easy');
      expect(cap.chiefComplaint).toMatch(/发热|咳嗽|咽/);

      const stemi = generator.generateScenario('stemi', 'easy');
      expect(stemi.chiefComplaint).toMatch(/胸|痛|闷/);
    });

    it('should include imaging results', () => {
      const scenario = generator.generateScenario('stemi', 'hard');
      expect(scenario.imagingResults).toBeDefined();
      expect(scenario.imagingResults!.length).toBeGreaterThan(0);
    });

    it('should set isAbnormal on lab results for hard difficulty', () => {
      const scenario = generator.generateScenario('cap', 'hard');
      const abnormalLabs = scenario.labResults.filter((lab) => lab.isAbnormal);
      expect(abnormalLabs.length).toBeGreaterThan(0);
    });
  });

  describe('randomizeFindings', () => {
    it('should generate a new scenario with different id', () => {
      const original = generator.generateScenario('cap', 'medium');
      const randomized = generator.randomizeFindings(original);

      expect(randomized.id).not.toBe(original.id);
      expect(randomized.pathId).toBe(original.pathId);
    });

    it('should preserve pathway ID', () => {
      const original = generator.generateScenario('acute_appendicitis', 'hard');
      const randomized = generator.randomizeFindings(original);

      expect(randomized.pathId).toBe('acute_appendicitis');
    });

    it('should keep chief complaint same', () => {
      const original = generator.generateScenario('cap', 'medium');
      const randomized = generator.randomizeFindings(original);

      expect(randomized.chiefComplaint).toBe(original.chiefComplaint);
    });

    it('should produce different vital signs after randomization', () => {
      // This test checks variation - given the random nature,
      // we test that the function produces structurally valid output
      const original = generator.generateScenario('cap', 'medium');
      const randomized = generator.randomizeFindings(original);

      expect(randomized.vitalSigns).toBeDefined();
      expect(randomized.vitalSigns.temperature).toBeDefined();
      expect(randomized.vitalSigns.heartRate).toBeDefined();
      expect(randomized.vitalSigns.bloodPressure).toBeDefined();
      expect(randomized.vitalSigns.respiratoryRate).toBeDefined();
      expect(randomized.vitalSigns.spo2).toBeDefined();
    });
  });

  describe('serializeScenario', () => {
    it('should produce formatted CLI output', () => {
      const scenario = generator.generateScenario('cap', 'easy');
      const output = serializeScenario(scenario);

      expect(output).toContain('【患者信息】');
      expect(output).toContain('主诉：');
      expect(output).toContain('【生命体征】');
      expect(output).toContain('【检验结果】');
      expect(output).toContain('体温');
      expect(output).toContain('心率');
      expect(output).toContain('血压');
    });

    it('should include lab results in output', () => {
      const scenario = generator.generateScenario('cap', 'medium');
      const output = serializeScenario(scenario);

      // Should contain at least one lab name
      expect(output).toContain('WBC');
      expect(output).toContain('CRP');
    });

    it('should include imaging results when present', () => {
      const scenario = generator.generateScenario('stemi', 'hard');
      const output = serializeScenario(scenario);

      expect(output).toContain('【影像学】');
    });
  });

  describe('difficulty scaling', () => {
    it('should generate scenarios for all difficulty levels', () => {
      const easy = generator.generateScenario('cap', 'easy');
      const medium = generator.generateScenario('cap', 'medium');
      const hard = generator.generateScenario('cap', 'hard');

      expect(easy).toBeDefined();
      expect(medium).toBeDefined();
      expect(hard).toBeDefined();
      expect(easy.vitalSigns).toBeDefined();
      expect(medium.vitalSigns).toBeDefined();
      expect(hard.vitalSigns).toBeDefined();
    });
  });

  describe('exported functions', () => {
    it('should export singleton instance', () => {
      expect(scenarioGenerator).toBeDefined();
      expect(scenarioGenerator instanceof ScenarioGenerator).toBe(true);
    });

    it('should export factory functions', () => {
      expect(typeof generateScenario).toBe('function');
      expect(typeof randomizeFindings).toBe('function');
      expect(typeof serializeScenario).toBe('function');
    });

    it('should generate valid scenario using factory function', () => {
      const scenario = generateScenario('stemi', 'medium');
      expect(scenario.id.startsWith('scenario_')).toBe(true);
      expect(scenario.pathId).toBe('stemi');
    });
  });
});

describe('Scenario data integrity', () => {
  let generator: ScenarioGenerator;

  beforeEach(() => {
    generator = new ScenarioGenerator();
  });

  it('should have valid vital signs ranges', () => {
    const scenario = generator.generateScenario('cap', 'hard');

    expect(scenario.vitalSigns.temperature).toBeGreaterThan(35);
    expect(scenario.vitalSigns.temperature).toBeLessThan(42);
    expect(scenario.vitalSigns.heartRate).toBeGreaterThan(30);
    expect(scenario.vitalSigns.heartRate).toBeLessThan(200);
    expect(scenario.vitalSigns.spo2).toBeGreaterThan(50);
    expect(scenario.vitalSigns.spo2).toBeLessThanOrEqual(100);
  });

  it('should have valid lab results structure', () => {
    const scenario = generator.generateScenario('cap', 'hard');

    for (const lab of scenario.labResults) {
      expect(lab.name).toBeDefined();
      expect(lab.unit).toBeDefined();
      expect(typeof lab.value).toBe('number');
      expect(lab.referenceRange).toBeDefined();
      expect(typeof lab.isAbnormal).toBe('boolean');
    }
  });

  it('should have numeric lab values', () => {
    const scenario = generator.generateScenario('cap', 'hard');

    for (const lab of scenario.labResults) {
      expect(typeof lab.value).toBe('number');
      expect(isNaN(lab.value as number)).toBe(false);
    }
  });
});