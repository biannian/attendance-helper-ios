import test from "node:test";
import assert from "node:assert/strict";
import { parseLaunchParameter } from "../core/launch.js";
test("legacy four-line input", () => assert.deepEqual(parseLaunchParameter("refresh\nuser\n p w \ndevice"), {mode:"refresh",account:{username:"user",password:" p w ",deviceId:"device"}}));
test("action only", () => assert.deepEqual(parseLaunchParameter("near9"), {mode:"near9",account:null}));
test("partial account fails closed", () => assert.throws(()=>parseLaunchParameter("refresh\nuser\npassword\n")));
test("JSON account format", () => assert.equal(parseLaunchParameter('{"mode":"account","username":"u","password":"p","deviceId":"d"}').account.deviceId,"d"));
