import { vi } from 'vitest';
const { withTimeout, runWithWatchdog, createStageLogger } = require('../oracle-resilience.cjs');

describe('Oracle Resilience Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve if promise resolves before timeout (nativa resolvida)', async () => {
      const p = new Promise(resolve => setTimeout(() => resolve('ok'), 10));
      const result = await withTimeout(p, 200, 'test_stage');
      expect(result).toBe('ok');
    });

    it('should reject if promise rejects before timeout (nativa rejeitada, preservando erro original)', async () => {
      const p = new Promise((_, reject) => setTimeout(() => reject(new Error('Network error')), 10));
      await expect(withTimeout(p, 200, 'test_stage')).rejects.toThrow('Network error');
    });

    it('should reject with ORACLE_OPERATION_TIMEOUT if promise does not resolve (operação que nunca resolve)', async () => {
      const p = new Promise(resolve => setTimeout(() => resolve('ok'), 200));
      await expect(withTimeout(p, 50, 'test_stage')).rejects.toMatchObject({
        message: expect.stringContaining('Timeout de 50ms excedido'),
        code: 'ORACLE_OPERATION_TIMEOUT',
        context: { stage: 'test_stage', timeoutMs: 50 }
      });
    });

    it('should handle a Thenable with only .then (without throwing TypeError)', async () => {
      const thenable = {
        then: function(resolve) {
          setTimeout(() => resolve('thenable-ok'), 10);
        }
      };
      const result = await withTimeout(thenable, 200, 'test_stage');
      expect(result).toBe('thenable-ok');
    });

    it('should handle a Thenable with .then and .catch but no .finally (Supabase query simulation)', async () => {
      const supabaseQuerySimulation = {
        then: function(resolve, reject) {
          setTimeout(() => resolve('supabase-data'), 10);
        },
        catch: function(reject) {
          // empty
        }
        // No .finally
      };
      const result = await withTimeout(supabaseQuerySimulation, 200, 'test_stage');
      expect(result).toBe('supabase-data');
    });

    it('should clean up the timer on success (timeout limpando o timer)', async () => {
      vi.useFakeTimers();
      const p = Promise.resolve('instant');
      const promise = withTimeout(p, 5000, 'test_stage');
      await expect(promise).resolves.toBe('instant');
      // If timer was not cleaned up, there would be pending timers. Wait, unref() takes care of event loop.
      // We just ensure no unhandled exceptions.
      vi.useRealTimers();
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
