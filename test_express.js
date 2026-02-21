import express from 'express';
const app = express();
try { app.all('/chat/*', (req, res) => { }); } catch (e) { console.error('Error with /*:', e.message); }
try { app.all('/chat/(.*)', (req, res) => { }); } catch (e) { console.error('Error with /(.*):', e.message); }
try { app.all('/chat/:path(.*)', (req, res) => { }); } catch (e) { console.error('Error with /:path(.*):', e.message); }
