/**
 * Código del guardián (`qubiq-guardian.exe`), en C#.
 *
 * Se compila en el propio equipo con el `csc.exe` que trae Windows (.NET
 * Framework 4.8, que viene con Windows 10 y 11 y no se puede desinstalar), la
 * primera vez que hace falta. Ese compilador solo entiende **C# 5**: nada de
 * `$"..."`, `?.`, `nameof` ni miembros con `=>`.
 *
 * Qué hace: lanza el servidor con sus tuberías, se queda con ellas y las ofrece
 * por una tubería con nombre de Windows. Así el servidor no depende de que
 * QubiQ siga abierto: si la app se cierra de golpe, el guardián sigue leyendo
 * su salida, y la app, al volver, se reconecta y lo recupera todo.
 *
 * Protocolo, una línea por mensaje, campos separados por tabulador (el texto
 * va siempre al final, así que puede llevar tabuladores):
 *
 *   guardián → app
 *     H <protocolo> <pid del servidor> <arranque en ms>   al conectar
 *     L <número> <ms> <texto>                              una línea del servidor
 *     R                                                    fin de lo guardado
 *     X <código>                                           el servidor ha salido
 *   app → guardián
 *     I <base64>                                           bytes para su stdin
 *
 * Al conectar manda las últimas líneas que guarda y luego las nuevas. Cada
 * línea lleva un número que no se repite, para que la app no pinte dos veces
 * lo que ya tenía si se reconecta.
 *
 * Si el servidor sale sin nadie conectado, deja el código y sus últimas líneas
 * en el fichero de salida y termina: la app lo lee al volver.
 */
export const GUARDIAN_PROTOCOL = 1

export const GUARDIAN_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;

static class QubiqGuardian {
  const int Protocol = ${GUARDIAN_PROTOCOL};
  // Lo que se guarda para quien se conecte después. Un arranque de Minecraft
  // con mods son unos cientos de líneas; esto cubre de sobra el arranque y lo
  // que pase mientras la app está cerrada un buen rato.
  const int MaxLines = 5000;
  // Lo que se deja en el fichero de salida para diagnosticar el cierre.
  const int ExitLines = 200;
  // Si la app no lee (colgada), no se acumula sin fin: se la desconecta, y al
  // reconectar recibe lo guardado.
  const int MaxPending = 20000;

  static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
  static readonly object Gate = new object();
  static readonly Queue<string> Backlog = new Queue<string>();
  static readonly Queue<string> Pending = new Queue<string>();
  static long seq = 0;
  static NamedPipeServerStream current = null;
  static bool exited = false;
  static uint exitCode = 0;
  // La app ha recibido el aviso de salida.
  static bool exitDelivered = false;
  // Alguna vez se ha conectado la app.
  static bool everConnected = false;
  static Process child;
  static long startedAt;
  static readonly object StdinGate = new object();

  static int Main(string[] args) {
    if (args.Length != 1) return 64;
    Dictionary<string, string> spec;
    try {
      spec = ReadSpec(args[0]);
      try { File.Delete(args[0]); } catch (Exception) { }
    } catch (Exception) {
      return 65;
    }
    string exitFile = spec["exit"];

    ProcessStartInfo info = new ProcessStartInfo(spec["file"], spec["args"]);
    info.WorkingDirectory = spec["cwd"];
    info.UseShellExecute = false;
    info.RedirectStandardInput = true;
    info.RedirectStandardOutput = true;
    info.RedirectStandardError = true;
    info.StandardOutputEncoding = Utf8;
    info.StandardErrorEncoding = Utf8;
    // Igual que Node con windowsHide: consola propia sin ventana. Es la
    // consola a la que se engancha el Ctrl+Break de la parada.
    info.CreateNoWindow = true;

    child = new Process();
    child.StartInfo = info;
    try {
      child.Start();
    } catch (Exception e) {
      WriteFile(exitFile, "E\t" + OneLine(e.Message) + "\n");
      return 2;
    }
    startedAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;

    Thread outReader = StartThread(delegate () { Pump(child.StandardOutput); });
    Thread errReader = StartThread(delegate () { Pump(child.StandardError); });
    StartThread(delegate () { Accept(spec["pipe"]); });

    child.WaitForExit();
    // Lo que quede en las tuberías. Con un tope: si un nieto se quedó con
    // ellas abiertas (cmd que lanzó Java), no se espera para siempre.
    outReader.Join(5000);
    errReader.Join(5000);

    lock (Gate) {
      exited = true;
      exitCode = unchecked((uint)child.ExitCode);
      if (current != null) Pending.Enqueue("X\t" + exitCode);
      Monitor.PulseAll(Gate);

      // Si hay app conectada, se espera (poco) a que le llegue el aviso. Si le
      // llega, no se deja fichero: al volver a abrirse lo contaría como un
      // cierre con la app cerrada. Si nunca se conectó (un servidor que sale
      // nada más arrancar), se le da tiempo a llegar: está a punto.
      DateTime limit = DateTime.UtcNow.AddSeconds(everConnected ? 5 : 15);
      while (!exitDelivered && (current != null || !everConnected) && DateTime.UtcNow < limit) Monitor.Wait(Gate, 200);
      if (exitDelivered) return 0;
    }

    StringBuilder text = new StringBuilder();
    long ms = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    text.Append("X\t").Append(exitCode).Append('\t').Append(ms).Append('\n');
    lock (Gate) {
      string[] all = Backlog.ToArray();
      for (int i = Math.Max(0, all.Length - ExitLines); i < all.Length; i++) text.Append(all[i]).Append('\n');
    }
    WriteFile(exitFile, text.ToString());
    return 0;
  }

  /**
   * Todos los hilos son de fondo: el que manda es el principal, que espera al
   * servidor. Uno de primer plano bloqueado leyendo una tubería que un nieto
   * dejó abierta mantendría vivo al guardián sin servidor.
   */
  static Thread StartThread(ThreadStart body) {
    Thread thread = new Thread(body);
    thread.IsBackground = true;
    thread.Start();
    return thread;
  }

  static string OneLine(string text) {
    return (text ?? "").Replace("\r", " ").Replace("\n", " ");
  }

  static void WriteFile(string path, string text) {
    string tmp = path + ".tmp";
    File.WriteAllText(tmp, text, Utf8);
    if (File.Exists(path)) File.Delete(path);
    File.Move(tmp, path);
  }

  static Dictionary<string, string> ReadSpec(string path) {
    Dictionary<string, string> spec = new Dictionary<string, string>();
    foreach (string line in File.ReadAllLines(path, Utf8)) {
      int eq = line.IndexOf('=');
      if (eq <= 0) continue;
      spec[line.Substring(0, eq)] = Utf8.GetString(Convert.FromBase64String(line.Substring(eq + 1)));
    }
    foreach (string key in new string[] { "file", "args", "cwd", "pipe", "exit" }) {
      if (!spec.ContainsKey(key)) throw new InvalidDataException(key);
    }
    return spec;
  }

  static void Pump(StreamReader reader) {
    string line;
    while ((line = reader.ReadLine()) != null) {
      long ms = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
      lock (Gate) {
        seq++;
        string message = "L\t" + seq + "\t" + ms + "\t" + line;
        Backlog.Enqueue(message);
        if (Backlog.Count > MaxLines) Backlog.Dequeue();
        if (current != null) {
          Pending.Enqueue(message);
          if (Pending.Count > MaxPending) Drop(current);
          Monitor.PulseAll(Gate);
        }
      }
    }
  }

  /** Solo con el candado cogido. */
  static void Drop(NamedPipeServerStream pipe) {
    if (current != pipe) return;
    current = null;
    Pending.Clear();
    try { pipe.Dispose(); } catch (Exception) { }
  }

  static PipeSecurity OnlyThisUser() {
    PipeSecurity security = new PipeSecurity();
    security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
    return security;
  }

  static void Accept(string name) {
    while (true) {
      NamedPipeServerStream pipe;
      try {
        // Asynchronous es imprescindible: se lee y se escribe a la vez desde
        // dos hilos, y en un handle síncrono Windows pone la escritura en cola
        // detrás de la lectura pendiente. La salida del servidor solo llegaba
        // a la app cuando ella mandaba algo.
        pipe = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 65536, 65536, OnlyThisUser());
        pipe.WaitForConnection();
      } catch (Exception) {
        Thread.Sleep(500);
        continue;
      }

      lock (Gate) {
        Pending.Clear();
        Pending.Enqueue("H\t" + Protocol + "\t" + child.Id + "\t" + startedAt);
        foreach (string line in Backlog) Pending.Enqueue(line);
        Pending.Enqueue("R");
        if (exited) Pending.Enqueue("X\t" + exitCode);
        current = pipe;
        everConnected = true;
        Monitor.PulseAll(Gate);
      }

      NamedPipeServerStream mine = pipe;
      StartThread(delegate () { Write(mine); });
      Read(pipe);
      lock (Gate) { Drop(pipe); Monitor.PulseAll(Gate); }
    }
  }

  static void Write(NamedPipeServerStream pipe) {
    StreamWriter writer = new StreamWriter(pipe, Utf8);
    writer.NewLine = "\n";
    while (true) {
      List<string> batch = new List<string>();
      lock (Gate) {
        while (current == pipe && Pending.Count == 0) Monitor.Wait(Gate);
        if (current != pipe) return;
        while (Pending.Count > 0) batch.Add(Pending.Dequeue());
      }
      bool exitSent = false;
      try {
        foreach (string line in batch) {
          writer.WriteLine(line);
          if (line.StartsWith("X\t")) exitSent = true;
        }
        writer.Flush();
      } catch (Exception) {
        lock (Gate) { Drop(pipe); Monitor.PulseAll(Gate); }
        return;
      }
      if (exitSent) {
        lock (Gate) { exitDelivered = true; Monitor.PulseAll(Gate); }
      }
    }
  }

  static void Read(NamedPipeServerStream pipe) {
    try {
      StreamReader reader = new StreamReader(pipe, Utf8);
      string line;
      while ((line = reader.ReadLine()) != null) {
        if (line.StartsWith("I\t")) {
          byte[] bytes = Convert.FromBase64String(line.Substring(2));
          lock (StdinGate) {
            try {
              child.StandardInput.BaseStream.Write(bytes, 0, bytes.Length);
              child.StandardInput.BaseStream.Flush();
            } catch (Exception) {
              // El servidor ya se está cerrando.
            }
          }
        }
      }
    } catch (Exception) {
      // La app se ha ido; se espera a la siguiente.
    }
  }
}
`
