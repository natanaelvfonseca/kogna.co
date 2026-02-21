import express from 'express';
console.log('Testing express');
const app = express();
try { app.all('/chat/*', (req, res) => { }); console.log('/* OK'); } catch (e) { console.error('Error with /*:', e.message); }
try { app.all('/chat/(.*)', (req, res) => { }); console.log('/(.*) OK'); } catch (e) { console.error('Error with /(.*):', e.message); }
try { app.all('/chat/:path(.*)', (req, res) => { }); console.log('/:path(.*) OK'); } catch (e) { console.error('Error with /:path(.*):', e.message); }
