module.exports = {
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
};
