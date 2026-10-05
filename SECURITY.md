# Seguridad

## Cómo avisar de un problema

**No abras un issue público.** Usa el aviso privado de GitHub: pestaña **Security → Report a
vulnerability** de este repositorio. Solo lo verá el mantenedor hasta que esté arreglado.

Cuenta, si puedes:

- qué versión de la app y de Windows;
- qué hay que hacer para reproducirlo y qué consigue quien lo aprovecha;
- si necesita estar en la misma red, tener un dispositivo emparejado o acceso al equipo.

Es un proyecto mantenido por una persona en su tiempo libre: la respuesta llegará lo antes posible,
y se te avisará cuando haya una versión con el arreglo. Si quieres que se te mencione en las notas
de la versión, dilo.

## Versiones con soporte

Solo la **última versión publicada**. Los arreglos de seguridad salen en una versión nueva, no en
parches de las anteriores.

## Qué interesa especialmente

- **Control remoto** (`src/main/core/remote/`): emparejar sin el código, saltarse la firma de las
  órdenes, repetirlas, ver servidores sin permiso, mandar órdenes fuera de la lista permitida o
  sacar de la página algo que no sea la consola enmascarada.
- **Conectar con otro QubiQ**: que un anfitrión falso consiga el código o las órdenes pese a la
  huella fijada.
- **La interfaz y el proceso principal**: abrir ficheros o enlaces que no son `https`, leer o
  escribir fuera de la carpeta de datos, o ejecutar algo desde la ventana.
- **Ficheros que llegan de fuera**: zips de mods y copias de seguridad que escriben fuera de su
  carpeta, descargas que no se verifican.
- **Credenciales**: contraseñas de las consolas remotas de los juegos, de Steam o de factorio.com
  que acaben en registros, en el historial o en disco.

## Qué no es un fallo de la app

- Fallos de los servidores de los juegos, de SteamCMD o de los mods: avisa a quien los hace.
- Lo que se puede hacer desde fuera porque el usuario ha abierto un puerto o ha dado permisos a un
  dispositivo, mientras la app lo haya explicado antes.
- Que Windows SmartScreen avise al abrir el ejecutable: no está firmado, y el SHA-256 de cada
  versión se publica con ella.
