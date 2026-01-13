import { PeerServer } from 'peer';

const server = PeerServer({
  port: 9000,
  path: '/peerjs',
  allow_discovery: true,
});

console.log('PeerJS server running on http://localhost:9000/peerjs');
