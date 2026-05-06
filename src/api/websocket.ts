// WebSocket Server for Clinical Pathway Drill Game
// Real-time timer broadcast and timeout event push

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { gameEngine } from '../core/game-engine';

interface TimerUpdate {
  type: 'timer';
  attemptId: string;
  remainingTime: number;
  totalTime: number;
}

interface TimeoutEvent {
  type: 'timeout';
  attemptId: string;
  finalScore: number;
}

type WSMessage = TimerUpdate | TimeoutEvent;

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map(); // attemptId -> Set of WS clients
  private timerIntervals: Map<string, NodeJS.Timeout> = new Map(); // attemptId -> interval

  /**
   * Start WebSocket server on given port
   */
  start(port: number): void {
    if (this.wss) {
      console.log('WebSocket server already running');
      return;
    }

    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (e) {
          console.error('Invalid WebSocket message:', e);
        }
      });

      ws.on('close', () => {
        this.removeClient(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        this.removeClient(ws);
      });
    });

    this.wss.on('error', (err) => {
      console.error('WebSocket server error:', err);
    });

    console.log(`WebSocket server running on ws://localhost:${port}`);
  }

  /**
   * Handle HTTP upgrade request for WebSocket
   */
  handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    if (!this.wss) {
      socket.destroy();
      return;
    }

    // Handle the upgrade manually
    const urlStr = request.url || '/';
    const url = new URL(urlStr, `http://${request.headers.host || 'localhost'}`);

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss?.emit('connection', ws, request);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, msg: any): void {
    if (msg.type === 'subscribe' && msg.attemptId) {
      this.subscribe(ws, msg.attemptId);
    } else if (msg.type === 'unsubscribe' && msg.attemptId) {
      this.unsubscribe(ws, msg.attemptId);
    }
  }

  /**
   * Subscribe to game updates for a specific attempt
   */
  subscribe(ws: WebSocket, attemptId: string): void {
    if (!this.clients.has(attemptId)) {
      this.clients.set(attemptId, new Set());
    }
    this.clients.get(attemptId)!.add(ws);
    console.log(`Client subscribed to attempt: ${attemptId}`);

    // Start timer broadcast if not already running
    this.startTimerBroadcast(attemptId);
  }

  /**
   * Unsubscribe from game updates
   */
  unsubscribe(ws: WebSocket, attemptId: string): void {
    const clients = this.clients.get(attemptId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(attemptId);
        this.stopTimerBroadcast(attemptId);
      }
    }
  }

  /**
   * Remove client from all subscriptions
   */
  private removeClient(ws: WebSocket): void {
    for (const [attemptId, clients] of this.clients.entries()) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(attemptId);
        this.stopTimerBroadcast(attemptId);
      }
    }
  }

  /**
   * Start broadcasting timer updates for an attempt
   */
  private startTimerBroadcast(attemptId: string): void {
    if (this.timerIntervals.has(attemptId)) {
      return; // Already broadcasting
    }

    // Get initial remaining time from engine
    const attempt = gameEngine.getAttempt(attemptId);
    if (!attempt || attempt.completed) {
      return;
    }

    const totalTime = this.getTotalTime(attempt.difficulty);

    // Broadcast every 100ms
    const interval = setInterval(() => {
      const currentAttempt = gameEngine.getAttempt(attemptId);
      if (!currentAttempt || currentAttempt.completed) {
        this.stopTimerBroadcast(attemptId);
        return;
      }

      const update: TimerUpdate = {
        type: 'timer',
        attemptId,
        remainingTime: currentAttempt.remainingTime,
        totalTime,
      };

      this.broadcast(attemptId, update);

      // Check for timeout
      if (currentAttempt.remainingTime <= 0) {
        this.stopTimerBroadcast(attemptId);
        gameEngine.timeout(attemptId);
        const timeoutEvent: TimeoutEvent = {
          type: 'timeout',
          attemptId,
          finalScore: currentAttempt.score,
        };
        this.broadcast(attemptId, timeoutEvent);
      }
    }, 100);

    this.timerIntervals.set(attemptId, interval);
  }

  /**
   * Stop broadcasting timer updates
   */
  private stopTimerBroadcast(attemptId: string): void {
    const interval = this.timerIntervals.get(attemptId);
    if (interval) {
      clearInterval(interval);
      this.timerIntervals.delete(attemptId);
    }
  }

  /**
   * Broadcast message to all clients subscribed to an attempt
   */
  private broadcast(attemptId: string, message: WSMessage): void {
    const clients = this.clients.get(attemptId);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Get total time based on difficulty
   */
  private getTotalTime(difficulty: string): number {
    switch (difficulty) {
      case 'easy': return 300;
      case 'medium': return 180;
      case 'hard': return 120;
      default: return 180;
    }
  }

  /**
   * Send timeout event to all clients for an attempt
   */
  pushTimeout(attemptId: string, finalScore: number): void {
    this.stopTimerBroadcast(attemptId);
    const event: TimeoutEvent = {
      type: 'timeout',
      attemptId,
      finalScore,
    };
    this.broadcast(attemptId, event);
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    // Clear all timer intervals
    for (const interval of this.timerIntervals.values()) {
      clearInterval(interval);
    }
    this.timerIntervals.clear();
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();