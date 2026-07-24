import { vi } from 'vitest';
const { withTimeout, runWithWatchdog, createStageLogger } = require('../oracle-resilience.cjs');

describe('Oracle Resilience Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve if promise resolves before timeout', async () => {
      const p = new Promise(resolve => setTimeout(() => resolve('ok'), 50));
      const result = await withTimeout(p, 200, 'test_stage');
      expect(result).toBe('ok');
    });

    it('should reject if promise does not resolve before timeout (simulates consulta Supabase que nunca resolve)', async () => {
      const p = new Promise(resolve => setTimeout(() => resolve('ok'), 200));
      await expect(withTimeout(p, 50, 'test_stage')).rejects.toThrow(/Timeout de 50ms excedido/);
    });

    it('should reject if promise rejects before timeout (simulates erro de rede)', async () => {
      const p = new Promise((_, reject) => setTimeout(() => reject(new Error('Network error')), 50));
      await expect(withTimeout(p, 200, 'test_stage')).rejects.toThrow('Network error');
    });
  });

  describe('runWithWatchdog', () => {
    it('should resolve if cycle completes before timeout', async () => {
      const cycleFn = () => new Promise(resolve => setTimeout(() => resolve('done'), 50));
      const result = await runWithWatchdog(cycleFn, 200);
      expect(result).toBe('done');
    });

    it('should reject and call onTimeout if cycle exceeds timeout (liberacao de lock)', async () => {
      const cycleFn = () => new Promise(resolve => setTimeout(() => resolve('done'), 200));
      const onTimeout = vi.fn();
      await expect(runWithWatchdog(cycleFn, 50, onTimeout)).rejects.toThrow(/Ciclo excedeu timeout global/);
      expect(onTimeout).toHaveBeenCalled();
    });
  });

  describe('createStageLogger', () => {
    it('should log start and end correctly', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = createStageLogger('test-cycle');
      
      const startedAt = logger.start('my_stage', 10);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Stage Start] cycle=test-cycle stage=my_stage items=10'));
      
      logger.end('my_stage', startedAt, 5);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Stage End] cycle=test-cycle stage=my_stage durationMs='));
      
      logSpy.mockRestore();
    });

    it('should log error correctly', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = createStageLogger('test-cycle');
      
      const startedAt = logger.start('my_stage', 10);
      logger.error('my_stage', startedAt, 'timeout error');
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[Stage Error] cycle=test-cycle stage=my_stage durationMs='));
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('error=timeout error'));
      
      errSpy.mockRestore();
    });
  });
});
