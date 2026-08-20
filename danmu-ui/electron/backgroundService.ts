import net from 'net'
import path from "path";
import fs from "fs";
import { app } from "electron";
import { spawn, exec, type ChildProcessWithoutNullStreams } from 'child_process'


let liveBackend: ChildProcessWithoutNullStreams

const runSocketAndBackgroundService = async (callback: (obj: any) => void) => {
    let port = 6000

    let canBeUse = await judgePortCanUse(port);
    while (!canBeUse) {
        port++
        canBeUse = await judgePortCanUse(port);
    }

    const socketServer = net.createServer()
    socketServer.on('connection', (client) => {

        console.log('client connected');

        client.on('data', (data: Buffer) => {
            try {
                const info = JSON.parse(data.toString())
                callback(info)
            } catch (error) {
                // 看起来不会解析错误 {"method":"GameIsForeground","isForeground":false}
                // 先catch解决
                // console.log('json parse:' + data.toString());
            }
        })

        client.on('close', () => {
            console.log('client closed');
        })

        client.on('error', (error) => {
            console.log(error);
        })
    })

    socketServer.listen(port, () => {
        console.log('server listering on ' + port);
        runBackgroundService(port, true, false)
    })
}


const findDotnet = (): string | null => {
    // 1) 优先尝试系统 PATH 中的 dotnet
    // 2) 回退到常见安装路径（Electron 子进程往往没有 PATH）
    const candidates: string[] = [
        'dotnet',
        process.env['ProgramFiles(x86)'] + '\\dotnet\\dotnet.exe',
        process.env['ProgramFiles'] + '\\dotnet\\dotnet.exe',
        'C:\\Program Files (x86)\\dotnet\\dotnet.exe',
        'C:\\Program Files\\dotnet\\dotnet.exe',
    ].filter(Boolean) as string[];

    for (const c of candidates) {
        if (c === 'dotnet') return c; // 让 spawn 自己尝试 PATH
        if (fs.existsSync(c)) return c;
    }
    return null;
}

const runBackgroundService = (port: number, detectGame: boolean, detectMusice: boolean) => {

    // 该后台服务（游戏/音乐前台检测）为可选功能，与弹幕显示无关。
    // 缺失文件或未安装 dotnet 时优雅跳过，绝不阻塞/崩溃主进程。
    const args = [port.toString(), detectGame + "", detectMusice + ""]

    // 打包后：直接运行随包自带的自包含 exe（无需系统 dotnet）
    if (app.isPackaged) {
        const cwd = path.join(process.resourcesPath, 'backend', 'LiveBackgroundService')
        const exePath = path.join(cwd, 'LiveBackgroundService.exe')
        if (!fs.existsSync(exePath)) {
            console.warn(`[backgroundService] 未找到 ${exePath}，跳过前台检测后台服务（不影响弹幕功能）`);
            return;
        }
        spawnBackend(exePath, args, cwd)
        return
    }

    // 开发期：沿用 dotnet LiveBackgroundService.dll
    const targetPath = path.join(__dirname, '../danmu-exe/')
    const dllPath = path.join(targetPath, 'LiveBackgroundService.dll')
    if (!fs.existsSync(dllPath)) {
        console.warn(`[backgroundService] 未找到 ${dllPath}，跳过前台检测后台服务（不影响弹幕功能）`);
        return;
    }

    const dotnetCmd = findDotnet();
    if (dotnetCmd === null) {
        console.warn('[backgroundService] 未找到 dotnet，跳过前台检测后台服务（不影响弹幕功能）');
        return;
    }

    spawnBackend(dotnetCmd, ['LiveBackgroundService.dll', ...args], targetPath)
}

// 统一拉起后台进程并绑定错误/输出监听，避免未处理异常导致主进程崩溃
// windowsHide:true —— 静默启动，不弹出黑色控制台窗口
const spawnBackend = (cmd: string, args: string[], cwd: string) => {
    try {
        liveBackend = spawn(cmd, args, { cwd, windowsHide: true })

        liveBackend.on('error', (err) => {
            console.warn('[backgroundService] 启动后台服务失败，已忽略:', err.message);
        });

        liveBackend.stdout?.on('data', (data: Buffer) => {
            try {
                console.log(data.toString());
            } catch (error) {
                console.log(error)
            }
        });
    } catch (err) {
        console.warn('[backgroundService] spawn 后台服务异常，已忽略:', err);
    }
}


const judgePortCanUse = (port: number) => {
    const command = `netstat -ano|findstr "${port}"`;
    return new Promise<boolean>((resolve) => {
        exec(command, (error: any, stdout: string) => {
            resolve(stdout === "");
        });
    })
}


export { runSocketAndBackgroundService, liveBackend }
