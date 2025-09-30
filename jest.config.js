/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  watchman: false,
  moduleNameMapper: {
    [String.raw`^(\.{1,2}/.*)\.js$`]: "$1",
  },
  transform: {
    [String.raw`^.+\.(t|j)sx?$`]: [
      "ts-jest",
      {
        tsconfig: "./tsconfig.jest.json",
      },
    ],
  },
};

export default config;
