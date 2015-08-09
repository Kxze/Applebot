﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Client
{
    class ManualException : Exception
    {
        public ManualException() : base()
        { }

        public ManualException(string message) : base(message)
        { }

        public ManualException(string message, params object[] keys) : base(string.Format(message, keys))
        { }

        public ManualException(string message, Exception inner) : base(message, inner)
        { }

    }

    class Program
    {

        static void Main(string[] args)
        {
            Console.WriteLine("Applebot");

            try
            {
                Logger.Log(Logger.GenericLevels.LOG, "Loading settings");
                BotSettings settings = new BotSettings("settings.xml");

                string a = settings["username"];
                string b = settings["password"];
                string c = settings["lol"];
            }
            catch (ManualException e)
            {
                Logger.Log(Logger.GenericLevels.EXCEPTION, "Program was excaped due to manual exception being thrown ({0})", e.Message);
            }

            Console.WriteLine("Program ended");
            Console.ReadKey();
        }

    }
}
