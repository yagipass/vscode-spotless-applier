package io.github.yagipass.spotlessforgradleandmaven;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.util.Properties;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.eventspy.AbstractEventSpy;
import org.apache.maven.execution.ExecutionEvent;
import org.apache.maven.plugin.MojoExecution;

@Named("spotlessForGradleAndMavenIo")
@Singleton
public class IoRedirectSpy extends AbstractEventSpy {

  private int running;
  private String stderrPath;
  private InputStream originalIn;
  private PrintStream originalOut;
  private PrintStream originalErr;
  private InputStream in;
  private Unclosable out;
  private Unclosable err;

  @Override
  public synchronized void onEvent(Object event) {
    if (!(event instanceof ExecutionEvent)) {
      return;
    }
    ExecutionEvent executionEvent = (ExecutionEvent) event;
    if (executionEvent.getType() == ExecutionEvent.Type.SessionEnded) {
      restore();
      return;
    }
    MojoExecution mojo = executionEvent.getMojoExecution();
    if (mojo == null || !"spotless-maven-plugin".equals(mojo.getArtifactId())) {
      return;
    }
    Properties properties = executionEvent.getSession().getUserProperties();
    String stdin = properties.getProperty("spotlessForGradleAndMaven.stdin");
    String stdout = properties.getProperty("spotlessForGradleAndMaven.stdout");
    String stderr = properties.getProperty("spotlessForGradleAndMaven.stderr");
    if (stdin == null || stdout == null || stderr == null) {
      return;
    }
    switch (executionEvent.getType()) {
      case MojoStarted:
        if (running++ == 0) {
          redirect(stdin, stdout, stderr);
        }
        break;
      case MojoSucceeded:
      case MojoFailed:
        if (running > 0 && --running == 0) {
          restore();
        }
        break;
      default:
    }
  }

  private void redirect(String stdin, String stdout, String stderr) {
    stderrPath = stderr;
    originalIn = System.in;
    originalOut = System.out;
    originalErr = System.err;
    try {
      in = new FileInputStream(stdin);
      out = new Unclosable(new FileOutputStream(stdout, true));
      err = new Unclosable(new FileOutputStream(stderr, true));
    } catch (IOException e) {
      closeStreams();
      in = new ByteArrayInputStream(new byte[0]);
      out = new Unclosable(discarding());
      err = new Unclosable(discarding());
    }
    System.setIn(in);
    System.setOut(out);
    System.setErr(err);
  }

  private void restore() {
    running = 0;
    if (out == null) {
      return;
    }
    System.setIn(originalIn);
    System.setOut(originalOut);
    System.setErr(originalErr);
    boolean failed = out.checkError() | err.checkError();
    closeStreams();
    if (failed) {
      truncate(stderrPath);
    }
  }

  private void closeStreams() {
    if (in != null) {
      try {
        in.close();
      } catch (IOException e) {
        in = null;
      }
    }
    if (out != null) {
      out.closeFile();
    }
    if (err != null) {
      err.closeFile();
    }
    in = null;
    out = null;
    err = null;
  }

  private static void truncate(String path) {
    try {
      new FileOutputStream(path).close();
    } catch (IOException e) {
      return;
    }
  }

  private static OutputStream discarding() {
    return new OutputStream() {
      @Override
      public void write(int b) {}
    };
  }

  private static final class Unclosable extends PrintStream {

    Unclosable(OutputStream stream) {
      super(stream, true);
    }

    @Override
    public void close() {
      flush();
    }

    void closeFile() {
      super.close();
    }
  }
}
