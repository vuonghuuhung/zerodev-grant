import pkg from '@next/env';
const { loadEnvConfig } = pkg;

const projectDir = process.cwd();
loadEnvConfig(projectDir);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  env: {
    projectId: process.env.ZERODEV_PROJECT_ID,
    privateKey: process.env.PRIVATE_KEY,
  },
};

export default nextConfig;
