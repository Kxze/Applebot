﻿using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Client
{
    class MessageHandler
    {
        private BotSettings _settings;
        private BotCore _sender;
        private UserManager _manager;
        private TaskFactory _factory = new TaskFactory(TaskCreationOptions.PreferFairness, TaskContinuationOptions.PreferFairness);

        private List<Command> _commands = new List<Command>();
        private object _commandLock = new object();

        private List<Tuple<Command, DateTime, TimeSpan>> _previousCommands = new List<Tuple<Command, DateTime, TimeSpan>>();

        public MessageHandler(BotSettings settings, BotCore sender, UserManager manager)
        {
            _settings = settings;
            _sender = sender;
            _manager = manager;

            LoadCommands();
        }

        public void Execute(string user, string message)
        {
            if ((bool)_settings["loggingMessages"])
                Logger.Log(Logger.Level.MESSAGE, "{0}: {1}", user, message);

            lock (_commandLock)
            {
                Command command = Check(message);
                if (command != null)
                {
                    Logger.Log(Logger.Level.COMMAND, "User \"{0}\" triggered command ({1})", user, command.Name);
                    foreach (Tuple<Command, DateTime, TimeSpan> i in _previousCommands.ToArray())
                    {
                        if (i.Item2 < DateTime.UtcNow - i.Item3)
                            _previousCommands.Remove(i);
                    }

                    if (_previousCommands.Any(i => i.Item1 == command))
                    {
                        if (_manager[user].IsElevated)
                        {
                            Logger.Log(Logger.Level.COMMAND, "Command overflow for \"{0}\" was skipped by operator \"{1}\"", command.Name, user);
                            _previousCommands.RemoveAll(i => i.Item1 == command);
                        }
                        else
                        {
                            Logger.Log(Logger.Level.COMMAND, "Command \"{0}\" was suppressed due to overflow", command.Name);
                            return;
                        }
                    }

                    _previousCommands.Add(Tuple.Create(command, DateTime.UtcNow, command.Overflow));
                    _factory.StartNew(() => { command.Execute(MessageArgs.Generate(user, message)); });
                }
            }
        }

        private Command Check(string message)
        {
            foreach (Command command in _commands)
            {
                foreach (Regex regex in command.Expressions)
                {
                    if (regex.Match(message).Success)
                    {
                        return command;
                    }
                }
            }
            return null;
        }

        public void LoadCommands()
        {
            lock (_commandLock)
            {
                _commands.Clear();

                Logger.Log(Logger.Level.LOG, "Loading command dlls");

                if (!Directory.Exists("Commands"))
                {
                    Logger.Log(Logger.Level.WARNING, "Unable to locate commands folder, no commands will be loaded");
                    return;
                }

                string[] files = Directory.GetFiles("Commands", "*.dll");

                Logger.Log(Logger.Level.LOG, "Located ({0}) possible command dll", files.Length);

                List<Assembly> assemblies = new List<Assembly>();
                foreach (string file in files)
                {
                    AssemblyName name = AssemblyName.GetAssemblyName(file);
                    Assembly assembly = Assembly.Load(name);
                    assemblies.Add(assembly);
                }

                foreach (Assembly assembly in assemblies)
                {
                    Type[] types = assembly.GetTypes();
                    foreach (Type type in types)
                    {
                        if (type.IsSubclassOf(typeof(Command)))
                        {
                            ConstructorInfo constructor = type.GetConstructor(new Type[] { typeof(CommandData) });
                            if (constructor == null || !constructor.IsPublic)
                            {
                                Logger.Log(Logger.Level.ERROR, "Type \"{0}\" does not include the public constructor (BotCore, BotSettings, UserManager)", type.Name);
                                break;
                            }
                            Command command = (Command)Activator.CreateInstance(type, CommandData.Generate(_sender, _settings, _manager));
                            if (_commands.Any(i => i.Name == command.Name))
                            {
                                Logger.Log(Logger.Level.ERROR, "Command named \"{0}\" was already loaded, not loading new command", command.Name);
                                break;
                            }
                            Logger.Log(Logger.Level.LOG, "Loaded command \"{0}\" from dll \"{1}\"", command.Name, assembly.GetName().Name);
                            _commands.Add(command);
                        }
                    }
                }
            }
        }

    }
}
