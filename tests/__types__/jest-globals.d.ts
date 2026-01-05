// Minimal Jest globals and types for TypeScript when @types/jest isn't available to the compiler
declare var jest: any;

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn?: (() => Promise<any>) | (() => void)): void;
declare function test(name: string, fn?: (() => Promise<any>) | (() => void)): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function expect(actual: any): any;

// Minimal namespace to allow jest.Mocked<T> usage in tests
declare namespace jest {
  type Mocked<T> = { [K in keyof T]: any };
  function fn(): any;
}
