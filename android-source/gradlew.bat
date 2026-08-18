@ECHO OFF
SET DIR=%~dp0
IF NOT EXIST "%DIR%gradle\wrapper\gradle-wrapper.jar" (
  ECHO ERROR: gradle\wrapper\gradle-wrapper.jar is missing. Run "gradle wrapper" once in a Gradle-enabled environment. 1>&2
  EXIT /B 1
)
java -classpath "%DIR%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
