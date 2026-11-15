// Browser preview only: there is no MediaCodec to convert with. Rejecting keeps
// the caller's own error path honest instead of pretending a file was written.
export default {
  async convertToWav(): Promise<string> {
    throw new Error('Audio conversion is not available in the browser preview');
  },
};
