import assert from "node:assert/strict";
import {
  assertAudioMagic,
  assertContentTypeAllowed,
  assertPublicIp,
  isPrivateOrMetadataIp,
  SecureAudioDownloadError,
} from "./secure-audio-download.js";

function run(): void {
  assert.equal(isPrivateOrMetadataIp("127.0.0.1"), true);
  assert.equal(isPrivateOrMetadataIp("10.0.0.1"), true);
  assert.equal(isPrivateOrMetadataIp("192.168.1.1"), true);
  assert.equal(isPrivateOrMetadataIp("169.254.169.254"), true);
  assert.equal(isPrivateOrMetadataIp("172.16.0.1"), true);
  assert.equal(isPrivateOrMetadataIp("8.8.8.8"), false);

  assert.throws(() => assertPublicIp("127.0.0.1"), SecureAudioDownloadError);
  assert.doesNotThrow(() => assertPublicIp("1.1.1.1"));

  assert.throws(() => assertContentTypeAllowed("text/html"), SecureAudioDownloadError);
  assert.throws(() => assertContentTypeAllowed("application/json"), SecureAudioDownloadError);
  assert.doesNotThrow(() => assertContentTypeAllowed("audio/mpeg"));

  const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Buffer.alloc(20)]);
  assert.doesNotThrow(() => assertAudioMagic(mp3, "audio/mpeg"));

  const html = Buffer.from("<html>not audio</html>");
  assert.throws(() => assertAudioMagic(html, "audio/mpeg"), SecureAudioDownloadError);

  const wav = Buffer.alloc(16);
  wav.write("RIFF", 0);
  wav.write("WAVE", 8);
  assert.doesNotThrow(() => assertAudioMagic(wav, "audio/wav"));

  console.log("secure-audio-download unit tests passed");
}

run();
